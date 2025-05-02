# keuangan.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import requests
import logging
import json
import base64
from datetime import datetime

# Konfigurasi logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

router = APIRouter()

# Model untuk validasi input teks
class ExpenseInput(BaseModel):
    text: str

# Model untuk validasi input gambar dan caption
class ImageExpenseInput(BaseModel):
    image: str  # Base64 encoded image (string)
    caption: str  # Caption text (string)

# Fungsi untuk memanggil API Gemini untuk teks (Keuangan)
# keuangan.py (bagian yang relevan)

# Fungsi untuk memanggil API Gemini untuk teks (Keuangan)
# keuangan.py (bagian yang relevan)

# Fungsi untuk memanggil API Gemini untuk teks (Keuangan)
def call_gemini_api_keuangan(text: str):
    """
    Calls Gemini API to process text input and extract Keuangan transaction details.
    Returns the result in JSON format.
    """
    from dotenv import load_dotenv
    import os
    load_dotenv()
    
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY tidak ditemukan di environment variables")
        raise Exception("GEMINI_API_KEY tidak ditemukan di environment variables")
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    
    # Tanggal saat ini untuk default
    current_date = datetime.now().strftime("%Y-%m-%d")
    
    prompt = f"""
    Dari teks berikut: "{text}"
        Tentukan:
        1. Kategori (pilih dari: Gaji, Bisnis, Usaha Sampingan, Dividen, Pendapatan Bunga, Komisi, Lain-lain, Makanan & Minuman, Kehidupan Sosial, Transportasi, Pakaian, Perawatan Diri, Kesehatan, Pendidikan, Hadiah, Hewan Peliharaan, Pengembangan Diri, Aksesoris, Internet, Listrik, Air, Ponsel, Asuransi Kesehatan, Sampah, Gas, Saham, Cicilan Rumah, Cicilan Kendaraan)
        2. Tipe Transaksi (pilih dari: Pendapatan, Pengeluaran, Tagihan, Investasi, Cicilan)
        3. Ekstrak "Nominal". Konversi satuan "k", "rb", "ribu" menjadi x1000; "jt", "juta" menjadi x1000000; "m", "milyar" menjadi x1000000000. Berikan hasil konversi dalam bentuk angka desimal penuh, tanpa simbol mata uang atau satuan. Jika tidak ada atau tidak valid, tetapkan ke 0.
        4. Keterangan (barang/jasa spesifik)
        5. Tanggal (format YYYY-MM-DD)
        Berikan jawaban dalam format JSON:
        ```json
        {{
            "kategori": "[kategori]",
            "transaksi": "[tipe_transaksi]",
            "nominal": [nominal],
            "tanggal": "[tanggal]",
            "keterangan": "[keterangan]"
        }}
        ```
        Jika tidak ada informasi yang jelas, gunakan default:
        - Kategori: "Lain-lain"
        - Transaksi: "Pengeluaran"
        - Nominal: 0
        - Keterangan: "Tidak spesifik"
        - Tanggal: "{current_date}"
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
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        result = response.json()
        
        # Ambil teks yang dihasilkan oleh Gemini
        generated_text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        
        # Cari JSON dalam teks menggunakan regex
        import re
        json_match = re.search(r'```json\n(.*?)\n```', generated_text, re.DOTALL)
        if not json_match:
            logger.error(f"Tidak dapat menemukan JSON dalam respons Gemini: {generated_text}")
            raise Exception("Tidak dapat menemukan JSON dalam respons Gemini")

        # Parse JSON dari teks
        json_str = json_match.group(1)
        data = json.loads(json_str)
        
        # Pastikan semua field ada, gunakan default jika tidak ada
        response_data = {
            "kategori": data.get("kategori", "Lain-lain"),
            "transaksi": data.get("transaksi", "Pengeluaran"),
            "nominal": data.get("nominal", 0),
            "tanggal": data.get("tanggal", current_date),
            "keterangan": data.get("keterangan", "Tidak spesifik")
        }

        # Log hasil dari Gemini
        logger.info(f"Hasil dari Gemini API: {response_data}")
        
        return response_data
    
    except requests.exceptions.RequestException as e:
        logger.error(f"Error jaringan atau request timeout saat memanggil Gemini API: {str(e)}")
        raise Exception(f"Error jaringan atau request timeout saat memanggil Gemini API: {str(e)}")
    except json.JSONDecodeError as e:
        logger.error(f"Error saat mem-parsing JSON dari respons Gemini: {str(e)}, Teks: {generated_text}")
        raise Exception(f"Error saat mem-parsing JSON dari respons Gemini: {str(e)}")
    except Exception as e:
        logger.error(f"Error saat memproses respons Gemini (teks keuangan): {str(e)}")
        raise Exception(f"Error saat memproses respons Gemini: {str(e)}")
    
# Fungsi untuk memanggil API Gemini untuk gambar dan caption (Keuangan)
# keuangan.py (bagian yang relevan)

# Fungsi untuk memanggil API Gemini untuk gambar dan caption (Keuangan)
def call_gemini_image_api_keuangan(image_base64: str, caption: str):
    logger.info("Masuk ke fungsi call_gemini_image_api_keuangan")
    from dotenv import load_dotenv
    import os
    load_dotenv()
    
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY tidak ditemukan di environment variables")
        raise Exception("GEMINI_API_KEY tidak ditemukan di environment variables")
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    
    # Tanggal saat ini untuk default
    current_date = datetime.now().strftime("%Y-%m-%d")
    
    
    prompt = """
    Analisis gambar ini (misalnya, struk belanja) dan identifikasi setiap transaksi secara terpisah. Untuk setiap item, tentukan:
    1. Kategori (pilih dari: Makanan & Minuman, Kehidupan Sosial, Kebutuhan Anak, Transportasi, Pakaian, Perawatan Diri, Kesehatan, Pendidikan, Hadiah, Hewan Peliharaan, Pengembangan Diri, Aksesoris, Internet, Listrik, Air, Ponsel, Asuransi Jiwa, Asuransi Kesehatan, Sampah, Gas, Saham, Cicilan Rumah, Cicilan Kendaraan)
    2. Tipe Transaksi (pilih dari: Pendapatan, Pengeluaran, Tagihan, Investasi, Cicilan)
    3. Nominal (jumlah tepat seperti yang tertulis pada item, hilangkan format titik atau koma jika ada, jika ada 2 angka 0 di balekang koma atau titik hilangkan juga, tanpa simbol 'Rp', dan tanpa pembulatan)
    4. Keterangan (barang/jasa spesifik seperti yang tertulis) atau tentukan dari caption '{caption}' jika ada

    Instruksi detail: 
      - Jika ada diskon maka tambahkan minus pada nominal
      - Jika ada Total maka abaikan nominal yang lain yg menyatakan item
      - Jika ada pajak maka tambahkan nominal pajak ke nominal item
      - Jika ada keterangan yang tidak jelas, gunakan "Tidak spesifik" 
      - Jika ada Kategori di '{caption}',  Maka Penentuan Kategori diutaman berdasarkan caption
      
    Kembalikan hasil dalam format JSON yang valid:
    ```json
    {
      "transactions": [
        {
          "kategori": "[kategori]",
          "tipe_transaksi": "[tipe_transaksi]",
          "nominal": [nominal],
          "keterangan": "[keterangan]"
        }
      ]
    }
    ```
    Jika tidak ada transaksi yang terdeteksi, kembalikan array kosong: {"transactions": []}.
    Pastikan respons Anda adalah JSON yang valid tanpa teks tambahan di luar JSON.
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
        # curl_command = generate_curl_command(url, headers, payload)
        # logger.info(f"Perintah curl untuk Gemini API (teks): {curl_command}")
        
        logger.info("Memanggil Gemini API untuk gambar dan caption keuangan")
        response = requests.post(url, json=payload, headers=headers, timeout=60)
        response.raise_for_status()
        result = response.json()
        
        generated_text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
        
        logger.info(f"Respons mentah dari Gemini (gambar keuangan): {generated_text}")

        cleaned_text = generated_text
        if cleaned_text.startswith("```json"):
            cleaned_text = generated_text[7:-3].strip()
        elif cleaned_text.startswith("```"):
            cleaned_text = generated_text[3:-3].strip()
        
        try:
            parsed_result = json.loads(cleaned_text)
            if not isinstance(parsed_result, dict) or "transactions" not in parsed_result or not isinstance(parsed_result["transactions"], list):
                logger.error(f"Struktur respons JSON dari Gemini tidak valid: {parsed_result}")
                raise Exception(f"Struktur JSON tidak valid dari Gemini API. Teks respons mentah: {generated_text}")
                 
            transactions_raw = parsed_result["transactions"]
            
            transactions_processed = []
            for item in transactions_raw:
                if not isinstance(item, dict):
                    logger.warning(f"Item dalam array transactions bukan objek: {item}. Melewati.")
                    continue
                     
                processed_item = {}
                processed_item['tipe_transaksi'] = str(item.get('tipe_transaksi', 'Pengeluaran'))
                processed_item['kategori'] = str(item.get('kategori', 'Lain-lain'))  # Ubah ke 'kategori'
                
                try:
                    processed_item['nominal'] = float(item.get('nominal', 0.0))
                except (ValueError, TypeError):
                    logger.warning(f"Gagal mengkonversi nominal '{item.get('nominal')}' menjadi float. Menggunakan nilai default 0.0")
                    processed_item['nominal'] = 0.0
                
                # Ambil tanggal dari respons, jika tidak ada atau tidak valid, gunakan tanggal saat ini
                tanggal = item.get('tanggal', current_date)
                try:
                    # Validasi format tanggal (YYYY-MM-DD)
                    parsed_date = datetime.strptime(tanggal, "%Y-%m-%d")
                    current_datetime = datetime.strptime(current_date, "%Y-%m-%d")
                    if parsed_date > current_datetime:
                        logger.warning(f"Tanggal '{tanggal}' adalah tanggal di masa depan. Menggunakan tanggal saat ini: {current_date}")
                        tanggal = current_date
                except ValueError:
                    logger.warning(f"Tanggal '{tanggal}' tidak valid. Menggunakan tanggal saat ini: {current_date}")
                    tanggal = current_date
                processed_item['tanggal'] = tanggal

                processed_item['keterangan'] = str(item.get('keterangan', 'Transaksi otomatis'))  # Tambahkan keterangan
                 
                transactions_processed.append(processed_item)

            logger.info(f"Transaksi yang diparsing dan diproses: {transactions_processed}")
            
            return transactions_processed 
            
        except json.JSONDecodeError as e:
            logger.error(f"Gagal mem-parse respons sebagai JSON: {cleaned_text}. Error: {e}")
            raise Exception(f"Respons JSON tidak valid dari Gemini API: {str(e)}. Teks mentah: {generated_text}")
        except Exception as e:
            logger.error(f"Error saat memproses struktur JSON dari Gemini: {str(e)}. Teks mentah: {generated_text}")
            raise Exception(f"Error memproses struktur JSON dari Gemini: {str(e)}. Teks mentah: {generated_text}")

    except requests.exceptions.RequestException as e:
        logger.error(f"Error jaringan atau request timeout saat memanggil Gemini API: {str(e)}")
        raise Exception(f"Error jaringan atau request timeout saat memanggil Gemini API: {str(e)}")
    except Exception as e:
        logger.error(f"Error tak terduga saat memanggil Gemini Image API: {str(e)}")
        raise Exception(f"Error tak terduga saat memanggil Gemini Image API: {str(e)}")

# Endpoint untuk memproses pengeluaran (teks) - Keuangan
@router.post("/process_expense_keuangan")
async def process_expense_keuangan(input: ExpenseInput):
    """
    Processes text input to extract Keuangan transaction details using Gemini API.
    """
    text = input.text.strip()
    
    if not text:
        raise HTTPException(status_code=400, detail="Teks tidak boleh kosong")

    try:
        result = call_gemini_api_keuangan(text)
        if "error" in result:
            logger.warning(f"Gemini API returned specific error for text '{text}': {result['error']}")
            raise HTTPException(status_code=400, detail=f"Kesalahan dari Gemini: {result['error']}")
        return result
    except Exception as e:
        logger.error(f"Error memproses input teks '{text}': {str(e)}")
        raise HTTPException(status_code=500, detail=f"Terjadi kesalahan saat memproses teks: {str(e)}")

# Endpoint untuk memproses pengeluaran (gambar dan caption) - Keuangan
@router.post("/process_image_expense_keuangan")
async def process_image_expense_keuangan(input: ImageExpenseInput):
    logger.info("Masuk ke endpoint process_image_expense_keuangan")
    """
    Processes image and caption input to extract Keuangan transaction details using Gemini Vision API.
    """
    try:
        transactions = call_gemini_image_api_keuangan(input.image, input.caption)
        return {"transactions": transactions}
    except Exception as e:
        logger.error(f"Error memproses gambar: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Terjadi kesalahan saat memproses gambar: {str(e)}")
    
# Fungsi untuk menghasilkan perintah curl
def generate_curl_command(url: str, headers: dict, payload: dict) -> str:
    """
    Generates a curl command string for the given URL, headers, and payload.
    """
    # Mulai dengan perintah dasar curl
    curl_cmd = f"curl -X POST '{url}'"
    
    # Tambahkan header
    for key, value in headers.items():
        curl_cmd += f" -H '{key}: {value}'"
    
    # Tambahkan payload (data JSON)
    # Escaping kutip dalam JSON untuk perintah curl
    payload_str = json.dumps(payload, ensure_ascii=False).replace("'", "'\\''")
    curl_cmd += f" -d '{payload_str}'"
    
    return curl_cmd