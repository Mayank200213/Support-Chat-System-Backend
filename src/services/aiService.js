async function getAiResponse(userMessage, conversationHistory = []) {
    try {
        const apiKey = process.env.GROQ_API_KEY;

        if (!apiKey || apiKey === 'dummy_key_or_replace' || apiKey === 'dummy_key') {
            // Mock mode
            console.log('Using mock AI response since no valid API key was provided.');
            return mockAiResponse(userMessage);
        }

        const messages = [
            { role: 'system', content: 'You are a helpful customer support agent. Give descriptive and helpful answers. If you do not know the answer or the user is angry, respond with a very short and unclear message to trigger human escalation.' },
            ...conversationHistory.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.message })),
            { role: 'user', content: userMessage }
        ];

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "llama-3.1-8b-instant", // Groq model
                "messages": messages,
            })
        });

        if (!response.ok) {
            console.error("Groq Error:", await response.text());
            throw new Error(`Groq API responded with status: ${response.status}`);
        }

        const data = await response.json();

        // OpenRouter returns data in the same format as OpenAI
        const aiText = data.choices[0].message.content.trim();
        const isLowConfidence = checkConfidence(aiText);

        return { text: aiText, isLowConfidence };

    } catch (error) {
        console.error('Error in AI Service:', error);
        return { text: "I'm having trouble connecting to my brain right now.", isLowConfidence: true };
    }
}

function mockAiResponse(message) {
    const lowerMsg = message.toLowerCase();

    if (lowerMsg.includes('help') || lowerMsg.includes('agent') || lowerMsg.includes('human') || lowerMsg.includes('escalate')) {
        return { text: "I don't understand.", isLowConfidence: true }; // Short response triggers escalation
    }

    // Normal confident response
    return {
        text: `I can help you with that! You said: "${message}". Please let me know if you need any more details on our products and services.`,
        isLowConfidence: false
    };
}

function checkConfidence(aiResponseText) {
    // Simple heuristic for confidence:
    // If response is too short or contains phrases indicating confusion
    const lowerRes = aiResponseText.toLowerCase();

    if (aiResponseText.length < 20) {
        return true; // Low confidence
    }

    const lowConfidencePhrases = ["i don't know", "i'm not sure", "i don't understand", "i am confused", "cannot help"];
    for (const phrase of lowConfidencePhrases) {
        if (lowerRes.includes(phrase)) {
            return true;
        }
    }

    return false;
}

module.exports = {
    getAiResponse
};
