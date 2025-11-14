// agent/js/chat_handler.js
document.addEventListener("DOMContentLoaded", () => {
  const newChatBtn = document.getElementById("newChatBtn");
  const messagesContainer = document.getElementById("messagesContainer");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const sidebar = document.querySelector(".sidebar");
  const conversationsList = document.querySelector(".conversations-list");
  const sidebarOverlay = document.querySelector(".sidebar-overlay");

  // --- Global Trackers ---
  window.activeChatId = null;   // current chatId in use
  window.isNewChat = true;      // flag to decide create/update
  window.currentAgentId = null; // current agent ID from URL
  window.currentAgentName = null; // current agent name from URL

  // --- Extract Agent Info from URL ---
  function getAgentInfoFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const agentId = urlParams.get('agentId');
    const agentName = urlParams.get('agentName');
    return { agentId, agentName: agentName ? decodeURIComponent(agentName) : 'Unknown Agent' };
  }

  // Initialize agent info on page load
  const agentInfo = getAgentInfoFromURL();
  window.currentAgentId = agentInfo.agentId;
  window.currentAgentName = agentInfo.agentName;

  console.log(`🤖 Current Agent: ${window.currentAgentName} (ID: ${window.currentAgentId})`);

  // --- Helpers ---
  function generateChatId() {
    return "chat_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
  }

  function getChatHistory() {
    return Array.from(messagesContainer.querySelectorAll(".message"))
      .map(el => {
        const role = el.classList.contains("ai") ? "ai" : "user";
        const content = el.querySelector(".message-content")?.innerText.trim() || "";
        return { role, content };
      })
      .filter(m => m.content);
  }

  // --- New Structure: Get all agents data ---
  function getAllAgentsData() {
    return JSON.parse(localStorage.getItem("agentChatsData") || "{}");
  }

  // --- Save all agents data ---
  function saveAllAgentsData(data) {
    localStorage.setItem("agentChatsData", JSON.stringify(data));
  }

  // --- Get current agent's chats ---
  function getCurrentAgentChats() {
    if (!window.currentAgentId) return [];
    const allData = getAllAgentsData();
    return allData[window.currentAgentId]?.chats || [];
  }

  // --- Save current agent's chats ---
  function saveCurrentAgentChats(chats) {
    if (!window.currentAgentId) return;
    
    const allData = getAllAgentsData();
    
    if (!allData[window.currentAgentId]) {
      allData[window.currentAgentId] = {
        agentId: window.currentAgentId,
        agentName: window.currentAgentName,
        chats: []
      };
    }
    
    allData[window.currentAgentId].chats = chats;
    saveAllAgentsData(allData);
  }

  // --- Save Current Chat Function ---
  async function saveCurrentChat() {
    if (!window.currentAgentId) {
      console.warn("⚠️ No agent ID found. Cannot save chat.");
      return;
    }

    const chatHistory = getChatHistory();
    if (!chatHistory.length) return;

    let agentChats = getCurrentAgentChats();

    if (window.isNewChat) {
      // 💡 Generate the unique ID on the client
      const chatId = generateChatId();
      window.activeChatId = chatId; // Set immediately to prevent race conditions
      window.isNewChat = false; // Mark as existing chat immediately
      
      let chatTitle = `Chat-${Date.now()}`; // Default fallback title

      try {
        // Call the chat title generator API
        const response = await fetch("http://localhost:3001/chat_title_generator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: chatHistory }),
        });

        const result = await response.json();

        // Check success and extract title directly from the response root
        if (result?.success && result?.chatTitle) {
          chatTitle = result.chatTitle;
          console.log(`✅ Received title from server: ${chatTitle}`);
        } else {
          console.warn("⚠️ Chat title generation failed, using fallback title.", result?.error);
        }
        
        const newChat = {
          chatId,
          title: chatTitle,
          history: chatHistory,
          timestamp: Date.now()
        };

        agentChats.push(newChat);
        saveCurrentAgentChats(agentChats);

        console.log(`✅ Saved new chat for agent ${window.currentAgentId}:`, newChat);
        renderConversationList();

      } catch (error) {
        console.error("❌ Error saving new chat:", error);

        // Fallback: save with the already generated chat ID and fallback title
        const newChat = {
          chatId,
          title: chatTitle,
          history: chatHistory,
          timestamp: Date.now()
        };
        agentChats.push(newChat);
        saveCurrentAgentChats(agentChats);

        console.log("⚠️ Saved new chat with fallback ID/title due to network error:", newChat);
        renderConversationList();
      }

    } else {
      // ✅ Update existing chat
      const chatIndex = agentChats.findIndex(c => c.chatId === window.activeChatId);
      if (chatIndex !== -1) {
        agentChats[chatIndex].history = chatHistory;
        agentChats[chatIndex].timestamp = Date.now(); // Update timestamp
        saveCurrentAgentChats(agentChats);
        console.log(`🔄 Updated existing chat: ${window.activeChatId}`);
        renderConversationList();
      }
    }
  }

  // --- Sidebar UI ---
  function renderConversationList() {
    const chats = getCurrentAgentChats();
    conversationsList.innerHTML = "";

    if (!chats.length) {
      conversationsList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No conversations yet</div>';
      return;
    }

    // Sort chats by timestamp (newest first)
    const sortedChats = [...chats].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    sortedChats.forEach(chat => {
      const lastMsg = chat.history.length
        ? chat.history[chat.history.length - 1].content
        : "No messages";

      const item = document.createElement("div");
      item.classList.add("conversation-item");
      if (chat.chatId === window.activeChatId) item.classList.add("active");

      item.innerHTML = `
        <div class="conversation-preview">
          <div class="conversation-title">${chat.title}</div>
          <div class="conversation-snippet">${lastMsg.substring(0, 60)}${lastMsg.length > 60 ? '...' : ''}</div>
        </div>
      `;

      item.addEventListener("click", () => {
        document.querySelectorAll(".conversation-item").forEach(el => el.classList.remove("active"));
        item.classList.add("active");

        // ✅ Load old chat
        loadChatById(chat.chatId);

        // ✅ Set flags for existing chat
        window.isNewChat = false;
        window.activeChatId = chat.chatId;

        collapseSidebar();
      });

      conversationsList.appendChild(item);
    });
  }

  function expandSidebar() {
    sidebar.classList.add("visible");
    messagesContainer.classList.add("blurred");
    sidebarOverlay.classList.add("visible");
  }

  function collapseSidebar() {
    sidebar.classList.remove("visible");
    messagesContainer.classList.remove("blurred");
    sidebarOverlay.classList.remove("visible");
  }

  // --- Public method to load a chat by id ---
  window.loadChatById = function (chatId) {
    const chats = getCurrentAgentChats();
    const chat = chats.find(c => c.chatId === chatId);

    if (!chat) {
      console.warn("⚠️ Chat not found:", chatId);
      return;
    }

    // ✅ Before loading new chat, save current one if needed
    if (window.activeChatId && window.activeChatId !== chatId) {
      saveCurrentChat();
    }

    window.activeChatId = chatId;
    window.isNewChat = false; // ✅ Loading existing chat

    messagesContainer.innerHTML = "";

    chat.history.forEach(msg => {
      const msgDiv = document.createElement("div");
      msgDiv.classList.add("message", msg.role === "ai" ? "ai" : "user");
      msgDiv.innerHTML = `
        <div class="message-avatar ${msg.role === "ai" ? "ai-avatar" : "user-avatar"}">
          ${msg.role === "ai" ? "AI" : "U"}
        </div>
        <div class="message-wrapper">
          <div class="message-content">${msg.content}</div>
        </div>
      `;
      messagesContainer.appendChild(msgDiv);
    });

    console.log(`📂 Loaded existing chat: ${chatId}`);
    renderConversationList();
  };

  // --- Handle New Chat ---
  newChatBtn.addEventListener("click", () => {
    // ✅ IMPORTANT: Reset flags BEFORE saving to prevent update during save
    const previousChatId = window.activeChatId;
    const previousIsNewChat = window.isNewChat;
    
    // Set new chat flags immediately
    window.isNewChat = true;
    window.activeChatId = null;
    
    // ✅ Save previous chat if there was one
    if (previousChatId && !previousIsNewChat) {
      // Temporarily restore previous state to save correctly
      window.activeChatId = previousChatId;
      window.isNewChat = false;
      saveCurrentChat();
      // Reset again after save
      window.activeChatId = null;
      window.isNewChat = true;
    } else if (previousIsNewChat && messagesContainer.children.length > 0) {
      // If it was a new chat with messages, save it
      window.isNewChat = false;
      window.activeChatId = previousChatId || generateChatId();
      saveCurrentChat();
      // Reset for the actual new chat
      window.activeChatId = null;
      window.isNewChat = true;
    }
    
    // ✅ Clear UI
    messagesContainer.innerHTML = "";
    document.getElementById("messageInput").value = "";
    
    // ✅ Update sidebar
    document.querySelectorAll(".conversation-item").forEach(el => el.classList.remove("active"));

    console.log("✨ Ready for new chat!");
    renderConversationList();
  });

  // --- Auto-save function (call this when sending messages) ---
  window.autoSaveChat = function() {
    saveCurrentChat();
  };

  // --- Event Listeners for Sidebar ---
  sidebarToggle.addEventListener("click", () => {
    renderConversationList();
    expandSidebar();
  });

  messagesContainer.addEventListener("click", () => {
    if (sidebar.classList.contains("visible")) collapseSidebar();
  });

  sidebarOverlay.addEventListener("click", () => {
    if (sidebar.classList.contains("visible")) collapseSidebar();
  });

  // --- Load chats for current agent on page load ---
  renderConversationList();

  // --- Watch for URL changes (for SPA navigation) ---
  window.addEventListener('popstate', () => {
    const newAgentInfo = getAgentInfoFromURL();
    if (newAgentInfo.agentId !== window.currentAgentId) {
      // Save current chat before switching agents
      saveCurrentChat();
      
      // Update agent info
      window.currentAgentId = newAgentInfo.agentId;
      window.currentAgentName = newAgentInfo.agentName;
      
      // Reset chat state
      window.isNewChat = true;
      window.activeChatId = null;
      messagesContainer.innerHTML = "";
      
      // Reload conversations for new agent
      renderConversationList();
      
      console.log(`🔄 Switched to agent: ${window.currentAgentName} (ID: ${window.currentAgentId})`);
    }
  });
});

// ✅ Usage: Call this after each message exchange
// window.autoSaveChat();
