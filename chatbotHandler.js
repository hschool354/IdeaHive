// server/chatbotHandler.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Khởi tạo Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Lưu trữ lịch sử trò chuyện theo pageId (tạm thời trong bộ nhớ)
const chatHistories = new Map();

// Hàm gọi API của Gemini để lấy phản hồi thông minh
const callGeminiAPI = async (prompt, pageId) => {
  try {
    const result = await model.generateContent(prompt);
    const response = result.response;

    // Log toàn bộ phản hồi để kiểm tra
    console.log(`Gemini API response for page ${pageId}:`, response);

    // Lấy nội dung phản hồi
    const text = response.text();
    if (text) {
      return text;
    } else {
      console.error('Unexpected response structure:', response);
      return "Sorry, I couldn't process your request due to an unexpected response format.";
    }
  } catch (error) {
    console.error('Error calling Gemini API:', error.message);
    if (error.response) {
      console.error('Error details:', error.response);
    }
    if (error.message.includes('quota')) {
      return "Sorry, I've reached my usage limit. Please try again later.";
    } else if (error.message.includes('safety')) {
      return "Sorry, your message was flagged as unsafe. Please rephrase your question.";
    }
    return "Sorry, I encountered an error while processing your request.";
  }
};

// Logic xử lý chatbot
const getChatbotResponse = async (message, pageId, pageTitle = '', blocks = []) => {
  // Lấy lịch sử trò chuyện của pageId
  let history = chatHistories.get(pageId) || [];
  
  // Tạo prompt chi tiết
  let prompt = `You are IdeaBot, a helpful assistant for a collaborative workspace app called IdeaHive. Your goal is to assist users in managing their projects, providing clear instructions for using the app, and offering creative ideas based on their project context. Respond in the same language as the user's message.

### Project Context:
- The user is working on a page titled "${pageTitle || 'Untitled'}".
`;

  // Phân tích blocks để cung cấp bối cảnh chi tiết hơn
  if (blocks && blocks.length > 0) {
    const blockSummary = blocks
      .slice(0, 3)
      .map((block, index) => {
        const content = block.content || 'empty';
        const type = block.type || 'unknown';
        // Phân tích nội dung block để đưa ra gợi ý cụ thể
        let blockAnalysis = `Block ${index + 1} (type: ${type}, content: "${content}")`;
        if (content.toLowerCase().includes('todo') || content.toLowerCase().includes('task')) {
          blockAnalysis += ' - This block seems to be a task or to-do list.';
        } else if (content.toLowerCase().includes('meeting') || content.toLowerCase().includes('schedule')) {
          blockAnalysis += ' - This block seems related to scheduling or meetings.';
        }
        return blockAnalysis;
      })
      .join('\n');
    prompt += `### Page Content:\n${blockSummary}\n`;
  } else {
    prompt += `### Page Content:\nThe page currently has no blocks.\n`;
  }

  // Thêm lịch sử trò chuyện vào prompt để duy trì ngữ cảnh
  if (history.length > 0) {
    prompt += `### Chat History:\n`;
    history.forEach((entry, index) => {
      prompt += `Turn ${index + 1}:\nUser: ${entry.user}\nIdeaBot: ${entry.bot}\n`;
    });
  }

  // Thêm câu hỏi hiện tại của người dùng
  prompt += `### Current Request:\nThe user asks: "${message}".\nProvide a helpful and concise response. If the question is unclear, ask for clarification. If the user asks for ideas, give creative suggestions related to the page context. If the question is about using the app, explain the feature clearly (e.g., how to add a block, invite a team member, or save a page).`;

  // Gọi API Gemini để lấy phản hồi
  const response = await callGeminiAPI(prompt, pageId);

  // Lưu lịch sử trò chuyện (giới hạn 5 lượt gần nhất để tránh prompt quá dài)
  history.push({ user: message, bot: response });
  if (history.length > 5) {
    history = history.slice(-5);
  }
  chatHistories.set(pageId, history);

  return response;
};

// Hàm xử lý sự kiện chatbot qua Socket.io
const setupChatbotHandler = (io, socket) => {
  socket.on('chatbotMessage', async ({ pageId, message, pageTitle, blocks }) => {
    console.log(`Chatbot message received from page ${pageId}: ${message}`);
    try {
      const response = await getChatbotResponse(message, pageId, pageTitle, blocks);
      socket.emit('chatbotResponse', { message: response });
    } catch (error) {
      console.error('Error in chatbot handler:', error.message);
      socket.emit('chatbotResponse', { message: 'Sorry, something went wrong.' });
    }
  });

  // Xóa lịch sử trò chuyện khi người dùng ngắt kết nối
  socket.on('disconnect', () => {
    chatHistories.delete(socket.id);
  });
};

module.exports = { setupChatbotHandler };