from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import re
import requests
import logging
import json
import base64
from dotenv import load_dotenv
import os
from datetime import datetime

# Load environment variables from .env file
load_dotenv()

# Konfigurasi logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

app = FastAPI()

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "OK"}

# Model untuk validasi input teks
class ExpenseInput(BaseModel):
    text: str

# Model untuk validasi input gambar dan caption
class ImageExpenseInput(BaseModel):
    image: str  # Base64 encoded image (string)
    caption: str  # Caption text (string)

# Fungsi untuk memanggil API Gemini untuk teks
def call_gemini_api(text: str):
    """
    Calls Gemini API to process text input and extract LM transaction details, including date.
    Handles cases where Nominal is missing by returning partial data.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY tidak ditemukan di environment variables")
        raise Exception("GEMINI_API_KEY tidak ditemukan di environment variables")
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    
    # Tanggal saat ini untuk default
    current_date = datetime.now().strftime("%Y-%m-%d")
    
    prompt = f"""
    Analisis teks berikut untuk mengidentifikasi transaksi logam mulia: "{text}"

    Teks masukan diharapkan mengikuti pola: [Jenis LM] [Berat]g [Nominal] [Qty] [Tujuan Savings], dengan kemungkinan informasi tambahan seperti tanggal pembelian.
    Contoh format: Antam 5g 5000k 1 Dana Darurat
    Contoh dengan tanggal: Antam 10g Dana Darurat pembelian tanggal 11 Januari 2010

    Instruksi detail:
    - Jika informasi kunci (Jenis LM, Berat) tidak jelas, kembalikan respons yang hanya berisi: Error: [pesan spesifik kesalahan].
    - Identifikasi "Jenis LM" dari daftar berikut: Antam, UBS, PAMP, Galeri24, Wonderful Wish, Big Gold, Lotus Archi, Hartadinata, King Halim, Antam Retro, Semar Nusantara. Jika tidak ada di daftar atau tidak jelas, gunakan "Merk Lain". Jika diawali "emas ", abaikan "emas ".
    - Ekstrak "Berat". Konversi semua satuan ke gram. Contoh: "1kg" menjadi 1000, "5gr" menjadi 5. Hanya berikan angka (desimal atau bulat). Jika tidak ada atau tidak jelas, berikan 0.0.
    - Ekstrak "Nominal" (opsional). Konversi satuan "k", "rb", "ribu" menjadi x1000; "jt", "juta" menjadi x1000000; "m", "milyar" menjadi x1000000000. Berikan hasil konversi dalam bentuk angka desimal penuh, tanpa simbol mata uang atau satuan. Jika tidak ada atau tidak valid, tetapkan ke 0.
    - Ekstrak "Qty". Berikan dalam bentuk angka bulat. Jika tidak ada atau tidak jelas, berikan 1.
    - Identifikasi "Tabel Savings" dari daftar: Dana Darurat, Pendidikan Anak, Investasi, Dana Pensiun, Haji & Umroh, Rumah, Wedding, Mobil, Liburan, Gadget. Gunakan konteks jika tidak eksplisit disebutkan. Jika tidak relevan/tidak jelas, gunakan "Tidak Berlaku".
    - Ekstrak "Tanggal". Cari informasi tanggal dalam teks (misalnya, "pembelian tanggal 11 Januari 2010"). Konversi ke format YYYY-MM-DD (contoh: 2010-01-11). Jika tidak ada tanggal dalam teks, gunakan tanggal saat ini ({current_date}) sebagai default. Jika tanggal tidak valid (misalnya, di masa depan atau format salah), kembalikan: Error: Tanggal tidak valid.

    Berikan jawaban Anda dalam format teks yang persis seperti ini:
    Jenis LM: [jenis_lm]
    Berat: [berat_dalam_gram_sebagai_angka]
    Nominal: [nominal_sebagai_angka_penuh]
    Qty: [qty_sebagai_angka_bulat]
    Tabel Savings: [tabel_savings]
    Tanggal: [tanggal_dalam_format_YYYY-MM-DD]

    Pastikan angka untuk Berat, Nominal, dan Qty hanya angka tanpa teks tambahan, dan Tanggal dalam format YYYY-MM-DD. Jika Nominal tidak ada, tetapkan ke 0 dan lanjutkan parsing data lainnya.
    """

    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }]
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    try:
        logger.info(f"Memanggil Gemini API untuk teks: {text}")
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        result = response.json()
        
        generated_text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
        
        logger.info(f"Respons mentah dari Gemini (teks): {generated_text}")

        if generated_text.lower().startswith("error:"):
            error_message = generated_text.split(":", 1)[1].strip()
            logger.warning(f"Gemini returned explicit error: {error_message}")
            return {"error": error_message} 
        
        lines = generated_text.split('\n')
        parsed_data = {}
        for line in lines:
            if ': ' in line:
                key, value = line.split(': ', 1)
                parsed_data[key.strip()] = value.strip()

        jenis_lm = parsed_data.get('Jenis LM', 'Merk Lain')
        tabel_savings = parsed_data.get('Tabel Savings', 'Tidak Berlaku')
        tanggal = parsed_data.get('Tanggal', current_date)
        
        try:
            berat = float(parsed_data.get('Berat', 0))
        except (ValueError, TypeError):
            logger.warning(f"Gagal mengkonversi Berat '{parsed_data.get('Berat')}' menjadi float. Menggunakan nilai default 0.0")
            berat = 0.0

        try:
            nominal = float(parsed_data.get('Nominal', 0))
        except (ValueError, TypeError):
            logger.warning(f"Gagal mengkonversi Nominal '{parsed_data.get('Nominal')}' menjadi float. Menggunakan nilai default 0")
            nominal = 0.0

        try:
            qty = int(parsed_data.get('Qty', 1))
        except (ValueError, TypeError):
            logger.warning(f"Gagal mengkonversi Qty '{parsed_data.get('Qty')}' menjadi int. Menggunakan nilai default 1")
            qty = 1

        logger.info(f"Hasil parsing - Jenis LM: {jenis_lm}, Berat: {berat}, Nominal: {nominal}, Qty: {qty}, Tabel Savings: {tabel_savings}, Tanggal: {tanggal}")
        
        return {
            "jenis_lm": jenis_lm,
            "berat": berat,
            "nominal": nominal,
            "qty": qty,
            "tabel_savings": tabel_savings,
            "tanggal": tanggal
        }
    
    except requests.exceptions.RequestException as e:
        logger.error(f"Error jaringan atau request timeout saat memanggil Gemini API: {str(e)}")
        raise Exception(f"Error jaringan atau request timeout saat memanggil Gemini API: {str(e)}")
    except Exception as e:
        logger.error(f"Error saat memproses respons Gemini (teks): {str(e)}")
        raise Exception(f"Error saat memproses respons Gemini: {str(e)}")

# Fungsi untuk memanggil API Gemini untuk gambar dan caption
def call_gemini_image_api(image_base64: str, caption: str):
    logger.info("Masuk ke function call_gemini_image_api")
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY tidak ditemukan di environment variables")
        raise Exception("GEMINI_API_KEY tidak ditemukan di environment variables")
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-001:generateContent?key={api_key}"
    example_json = """
    {
      "transactions": [
        {
          "jenis_lm": "[Jenis LM]",
          "berat": [Berat dalam gram],
          "nominal": [Nominal angka penuh],
          "qty": [Qty],
          "tabel_savings": "[Tabel Savings]"
        }
      ]
    }
    """
    empty_json_example = '{"transactions": []}'
    prompt = f"""
    Analisis gambar ini (misalnya, struk pembelian logam mulia) dan ekstrak detail setiap transaksi terpisah.
    Gunakan caption berikut untuk membantu menentukan tujuan savings jika tidak jelas dari gambar: "{caption}"

    Untuk setiap item/transaksi yang terdeteksi, identifikasi:
    Sajikan semua detail transaksi yang terdeteksi dalam format JSON yang valid.
    Struktur JSON harus berupa objek tunggal dengan kunci "transactions" yang berisi array objek transaksi.
    Setiap objek dalam array "transactions" harus memiliki kunci: "jenis_lm" (string), "berat" (number), "nominal" (number), "qty" (integer), "tabel_savings" (string).

    Contoh format JSON yang diharapkan:
    {example_json}
    
    Instruksi Detail :
      - Identifikasi "Jenis LM" dari daftar berikut: Antam, UBS, PAMP, Galeri24, Wonderful Wish, Big Gold, Lotus Archi, Hartadinata, King Halim, Antam Retro, Semar Nusantara. Jika tidak ada di daftar atau tidak jelas, gunakan "Merk Lain". Jika diawali "emas ", abaikan "emas ".

    Jika tidak ada transaksi yang terdeteksi dalam gambar, kembalikan JSON dengan array kosong: {empty_json_example}

    Pastikan respons Anda HANYA JSON yang valid, tanpa teks penjelasan atau markdown formatting (seperti ```json```) di luar blok JSON itu sendiri.
    """

    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {
                    "inlineData": {
                        "mimeType": "image/jpeg",
                        "data": image_base64
                    }
                }
            ]
        }]
    }

    headers = {
        "Content-Type": "application/json"
    }

    try:
        logger.info("Memanggil Gemini API untuk gambar dan caption")
        response = requests.post(url, json=payload, headers=headers, timeout=60)
        response.raise_for_status()
        result = response.json()
        
        generated_text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
        
        logger.info(f"Respons mentah dari Gemini (gambar): {generated_text}")

        cleaned_text = generated_text
        if cleaned_text.startswith("```json"):
            cleaned_text = generated_text[7:-3].strip()
        elif cleaned_text.startswith("```"):
            cleaned_text = generated_text[3:-3].strip()
        
        try:
            parsed_result = json.loads(cleaned_text)
            if not isinstance(parsed_result, dict) or "transactions" not in parsed_result or not isinstance(parsed_result["transactions"], list):
                logger.error(f"Struktur respons JSON dari Gemini tidak valid: {parsed_result}")
                raise Exception(f"Invalid JSON structure received from Gemini API. Raw response text: {generated_text}")
                 
            transactions_raw = parsed_result["transactions"]
            
            transactions_processed = []
            for item in transactions_raw:
                if not isinstance(item, dict):
                    logger.warning(f"Item dalam array transactions bukan objek: {item}. Melewati.")
                    continue
                     
                processed_item = {}
                processed_item['jenis_lm'] = str(item.get('jenis_lm', 'Merk Lain'))
                 
                try:
                    processed_item['berat'] = float(item.get('berat', 0.0))
                except (ValueError, TypeError):
                    logger.warning(f"Gagal mengkonversi berat '{item.get('berat')}' menjadi float. Menggunakan nilai default 0.0")
                    processed_item['berat'] = 0.0

                try:
                    processed_item['nominal'] = float(item.get('nominal', 0.0))
                except (ValueError, TypeError):
                    logger.warning(f"Gagal mengkonversi nominal '{item.get('nominal')}' menjadi float. Menggunakan nilai default 0.0")
                    processed_item['nominal'] = 0.0

                try:
                    processed_item['qty'] = int(item.get('qty', 1))
                except (ValueError, TypeError):
                    logger.warning(f"Gagal mengkonversi qty '{item.get('qty')}' menjadi int. Menggunakan nilai default 1")
                    processed_item['qty'] = 1
                     
                processed_item['tabel_savings'] = str(item.get('tabel_savings', 'Tidak Berlaku'))
                 
                transactions_processed.append(processed_item)

            logger.info(f"Transaksi yang diparsing dan diproses: {transactions_processed}")
            
            return transactions_processed 
            
        except json.JSONDecodeError as e:
            logger.error(f"Gagal mem-parse respons sebagai JSON: {cleaned_text}. Error: {e}")
            raise Exception(f"Invalid JSON response from Gemini API: {str(e)}. Raw text: {generated_text}")
        except Exception as e:
            logger.error(f"Error saat memproses struktur JSON dari Gemini: {str(e)}. Raw text: {generated_text}")
            raise Exception(f"Error processing Gemini JSON response structure: {str(e)}. Raw text: {generated_text}")

    except requests.exceptions.RequestException as e:
        logger.error(f"Error jaringan atau request timeout saat memanggil Gemini API: {str(e)}")
        raise Exception(f"Error jaringan atau request timeout saat memanggil Gemini API: {str(e)}")
    except Exception as e:
        logger.error(f"Error tak terduga saat memanggil Gemini Image API: {str(e)}")
        raise Exception(f"Unexpected error during Gemini Image API call: {str(e)}")

# Endpoint untuk memproses pengeluaran (teks)
@app.post("/process_expense")
async def process_expense(input: ExpenseInput):
    """
    Processes text input to extract LM transaction details using Gemini API.
    """
    text = input.text.strip()
    
    if not text:
        raise HTTPException(status_code=400, detail="Teks tidak boleh kosong")

    try:
        result = call_gemini_api(text)
        if "error" in result:
            logger.warning(f"Gemini API returned specific error for text '{text}': {result['error']}")
            raise HTTPException(status_code=400, detail=f"Kesalahan dari Gemini: {result['error']}")
        return result
    except Exception as e:
        logger.error(f"Error memproses input teks '{text}': {str(e)}")
        raise HTTPException(status_code=500, detail=f"Terjadi kesalahan saat memproses teks: {str(e)}")

# Endpoint untuk memproses pengeluaran (gambar dan caption)
@app.post("/process_image_expense")
async def process_image_expense(input: ImageExpenseInput):
    logger.info("Masuk ke function ke endpoint")
    """
    Processes image and caption input to extract LM transaction details using Gemini Vision API.
    """
    try:
        transactions = call_gemini_image_api(input.image, input.caption)
        return {"transactions": transactions}
    except Exception as e:
        logger.error(f"Error memproses gambar: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Terjadi kesalahan saat memproses gambar: {str(e)}")