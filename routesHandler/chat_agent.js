// routesHandler/chat_agent.js
const formatAIAgentInput = require("../utils/format_AI_agent_input.js");
const sendMessageToAIAgent = require("../utils/send_message_to_AI_agent.js");
const removeAgentTokens = require("../utils/remove_agent_tokens.js");
const totalRequestsHandledIncrementer = require("../utils/total_requests_handled_incrementer.js");
const updateAgentUsage = require("../utils/update_agent_usage.js");
const checkAgentTokens = require("../utils/check_agent_tokens.js");

/**
 * Handles incoming chat requests for a given AI agent.
 * Verifies token availability, formats chat input, calls Gemini AI, 
 * deducts tokens, updates usage, and tracks request counts.
 *
 * @param {string} agentId - Unique ID of the agent.
 * @param {string} agentName - Display name of the agent.
 * @param {string} chatHistory - Previous conversation (formatted with U: and A: prefixes).
 * @param {string} userInput - Latest user message.
 * @param {object} agentDetails - Full details about the agent & company.
 * @param {string} apiKey - API key for the Gemini AI.
 *
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
async function chatAgentHandler(agentId, agentName, chatHistory, userInput, agentDetails, apiKey) {
  try {
    // 🧩 Step 1: Validate base inputs
    if (!agentId || !agentName) {
      return { success: false, error: "Agent ID and Agent Name are required." };
    }

    // 🧩 Step 2: Check available tokens for the agent
    const tokenCheck = await checkAgentTokens(agentId);
    if (!tokenCheck.success) {
      // No tokens available → return client-safe error
      return { success: false, error: "No tokens left. Try again after some time." };
    }

    const { modelName, availableTokens } = tokenCheck.data;

    // 🧩 Step 3: Format the input for the AI model
    let formattedInput;
    try {
      formattedInput = formatAIAgentInput(chatHistory, userInput, agentDetails);
    } catch (formatError) {
      console.error("❌ Error formatting AI input:", formatError);
      return { success: false, error: "Invalid chat or agent data provided." };
    }

    // 🧠 Step 4: Send message to AI model
    const aiResponse = await sendMessageToAIAgent(formattedInput, apiKey, modelName);
    if (!aiResponse.success) {
      return { success: false, error: "Error communicating with the AI model. Please try again later." };
    }

    const { reply, totalTokens } = aiResponse.data;

    // 🧩 Step 5: Deduct tokens for the used model
    const removeTokensResult = await removeAgentTokens(agentId, modelName, totalTokens);
    if (!removeTokensResult.success) {
      console.error("⚠️ Token removal failed:", removeTokensResult.error);
      // Not returning this to client — only internal log
    }

    // 🧩 Step 6: Log usage statistics for analytics
    const usageLogResult = await updateAgentUsage(agentId, agentName, modelName, totalTokens);
    if (!usageLogResult.success) {
      console.error("⚠️ Failed to log usage:", usageLogResult.error);
      // Internal log only — not user-facing
    }

    // 🧩 Step 7: Increment total handled requests
    try {
      await totalRequestsHandledIncrementer(agentId, agentName, modelName);
    } catch (counterErr) {
      console.error("⚠️ Failed to increment request count:", counterErr);
    }

    // ✅ Step 8: Return success response to client
    return {
      success: true,
      data: {
        reply
      },
    };
  } catch (error) {
    console.error("❌ Unexpected error in chatAgentHandler:", error);
    return {
      success: false,
      error: "An unexpected error occurred while processing your request.",
    };
  }
}

module.exports = chatAgentHandler;
