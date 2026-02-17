"""Test Groq API connection and key validity."""
import os
import asyncio
import httpx
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"

print(f"✓ GROQ_API_KEY loaded: {bool(GROQ_API_KEY)}")
if GROQ_API_KEY:
    print(f"  Key preview: {GROQ_API_KEY[:10]}...")

async def test_groq():
    if not GROQ_API_KEY:
        print("❌ GROQ_API_KEY is not set in .env file!")
        return
    
    print("\nAttempting connection to Groq API...")
    
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    
    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "user", "content": "Hello, test message"}
        ],
        "temperature": 0.4,
        "max_tokens": 100,
    }
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            print(f"POST {GROQ_API_URL}")
            response = await client.post(GROQ_API_URL, json=payload, headers=headers)
            print(f"Status Code: {response.status_code}")
            print(f"Response: {response.text[:500]}")
            
            if response.status_code == 200:
                print("\n✅ Groq API connection successful!")
            else:
                print(f"\n❌ Groq API returned error: {response.status_code}")
                
    except Exception as e:
        print(f"❌ Error: {type(e).__name__}: {str(e)}")

asyncio.run(test_groq())
