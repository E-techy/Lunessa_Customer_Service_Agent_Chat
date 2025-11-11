const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Increments total requests handled and logs timestamp for graphing
 * @param {string} agentId - Agent's ID
 * @param {string} agentName - Agent's name (if new record is created)
 * @param {string} modelName - Agent's model which is being used to handle this request
 * @returns {Promise<object>} Updated logs and total count
 */
async function totalRequestsHandledIncrementer(agentId, agentName, modelName) {
  if (!agentId || !agentName) {
    throw new Error("agentId and agentName are required");
  }

  const updated = await prisma.AgentRequestsHandledLogs.upsert({
    where: { agentId },
    update: {
      totalRequestsHandled: { increment: 1 },
      requestLogs: {
        push: {
          modelName: modelName,
          timestamp: new Date()
        }
      }
    },
    create: {
      agentId,
      agentName,
      totalRequestsHandled: 1,
      requestLogs: [
        { modelName: modelName, timestamp: new Date() }
      ]
    }
  });

  return {
    totalRequestsHandled: updated.totalRequestsHandled,
    latestLogs: updated.requestLogs.slice(-50) // last 50 timestamps for charting
  };
}

module.exports = totalRequestsHandledIncrementer;
