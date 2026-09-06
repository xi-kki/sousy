import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Vercel provides req.body for multipart/form-data when using formidable
    // But we need to handle the raw body for audio files
    const contentType = req.headers['content-type'] || '';
    
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Expected multipart/form-data' });
    }
    
    // For Vercel serverless, we need to use a different approach
    // The audio file comes as a buffer in the request
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    
    // Parse multipart manually (simplified)
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      return res.status(400).json({ error: 'No boundary found' });
    }
    
    const body = buffer.toString('binary');
    const parts = body.split(`--${boundary}`);
    
    let audioBuffer = null;
    let filename = 'recording.wav';
    
    for (const part of parts) {
      if (part.includes('Content-Disposition: form-data') && part.includes('name="file"')) {
        const filenameMatch = part.match(/filename="([^"]+)"/);
        if (filenameMatch) filename = filenameMatch[1];
        
        const contentStart = part.indexOf('\r\n\r\n');
        if (contentStart !== -1) {
          const content = part.substring(contentStart + 4);
          // Remove trailing boundary markers
          const endMarker = content.lastIndexOf(`--${boundary}`);
          const audioData = endMarker !== -1 ? content.substring(0, endMarker) : content;
          audioBuffer = Buffer.from(audioData.trim(), 'binary');
        }
      }
    }
    
    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: 'No audio file found' });
    }
    
    // Create a File-like object for Groq SDK
    const audioFile = new File([audioBuffer], filename, { type: 'audio/wav' });
    
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3-turbo',
      response_format: 'json',
      language: 'en',
    });
    
    return res.status(200).json({ text: transcription.text });
    
  } catch (error) {
    console.error('Transcription error:', error);
    return res.status(500).json({ error: 'Transcription failed', details: error.message });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};