import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { uploadImage } from '@/lib/cloudinary';

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { image } = await req.json();
    if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    // Upload to Cloudinary
    const { url, publicId } = await uploadImage(image, 'cardscan/cards');

    // Extract with OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all business card information from this image. Return ONLY valid JSON with these exact keys: name, title, company, phone, mobile, email, website, address. If a field is not found, use empty string. For phone numbers include country code if visible. Do not add any explanation, just the JSON object.' },
            { type: 'image_url', image_url: { url, detail: 'high' } },
          ],
        }],
        max_tokens: 500,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API Error ${response.status}`);
    }

    const data = await response.json();
    let text = data.choices[0].message.content.trim();
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const info = JSON.parse(text);

    return NextResponse.json({ ...info, cardImage: url, cardImagePublicId: publicId });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
