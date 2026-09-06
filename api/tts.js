import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const VOICE_MAP = {
  'Arista-PlayAI': 'Arista-PlayAI',
  'Atlas-PlayAI': 'Atlas-PlayAI',
  'Basil-PlayAI': 'Basil-PlayAI',
  'Briggs-PlayAI': 'Briggs-PlayAI',
  'Calum-PlayAI': 'Calum-PlayAI',
  'Celeste-PlayAI': 'Celeste-PlayAI',
  'Cheyenne-PlayAI': 'Cheyenne-PlayAI',
  'Fritz-PlayAI': 'Fritz-PlayAI',
  'Gail-PlayAI': 'Gail-PlayAI',
  'Indigo-PlayAI': 'Indigo-PlayAI',
  'Mason-PlayAI': 'Mason-PlayAI',
  'Mikail-PlayAI': 'Mikail-PlayAI',
  'Mitch-PlayAI': 'Mitch-PlayAI',
  'Quinn-PlayAI': 'Quinn-PlayAI',
  'Thunder-PlayAI': 'Thunder-PlayAI',
};

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
    const { text, voice = 'Arista-PlayAI' } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing text parameter' });
    }
    
    const selectedVoice = VOICE_MAP[voice] || 'Arista-PlayAI';
    
    const response = await groq.audio.speech.create({
      model: 'playai-tts',
      voice: selectedVoice,
      input: text,
      response_format: 'wav',
    });
    
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    
    return res.status(200).send(audioBuffer);
    
  } catch (error) {
    console.error('TTS error:', error);
    return res.status(500).json({ error: 'TTS failed', details: error.message });
  }
}