# keuangan.py
from fastapi import UploadFile, File, APIRouter, HTTPException
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


class VoiceExpenseInput(BaseModel):
    file_base64: str  # base64 encoded mp3

# Model untuk validasi input gambar dan caption
class ImageExpenseInput(BaseModel):
    image: str  # Base64 encoded image (string)
    caption: str  # Caption text (string)

# Fungsi untuk memanggil API Gemini untuk teks (Keuangan)
# keuangan.py (bagian yang relevan)

# Fungsi untuk memanggil API Gemini untuk teks (Keuangan)
# keuangan.py (bagian yang relevan)

ALLOWED_KATEGORI_PNG = [
    "Makanan & Minuman", "Kehidupan Sosial", "Kebutuhan Anak", "Transportasi", "Pakaian",
    "Perawatan Diri", "Kesehatan", "Pendidikan", "Hadiah", "Hewan Peliharaan",
    "Pengembangan Diri", "Aksesoris", "Internet", "Listrik", "Air", "Ponsel",
    "Asuransi Jiwa", "Asuransi Kesehatan", "Sampah", "Gas", "Saham",
    "Cicilan Rumah", "Cicilan Kendaraan", "Gaji","Bisnis", "Usaha Sampingan","Dividen","Pendapatan Bunga","Komisi","Pemasukan Lainnya"
]

# Fungsi untuk memanggil API Gemini untuk teks (Keuangan)
def call_gemini_api_keuangan(text: str):
    """
    Calls Gemini API to process text input and extract Keuangan transaction details.
    Returns the result in JSON format.
    """
    from dotenv import load_dotenv
    import os
    import re
    import json
    from datetime import datetime
    import requests

    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY tidak ditemukan di environment variables")
        raise Exception("GEMINI_API_KEY tidak ditemukan di environment variables")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    current_date = datetime.now().strftime("%Y-%m-%d")

    kategori_png_str = ", ".join(ALLOWED_KATEGORI_PNG)
    prompt = f"""
    Dari teks berikut: "{text}"
        Tentukan:
        1. kategori (pilih dari: {kategori_png_str}) jika peengeluaran, jika pendapatan pilih dari: Gaji, Bisnis, Usaha Sampingan, Dividen, Pendapatan Bunga, Komisi, Pemasukan Lainnya
        2. Tipe Transaksi (pilih dari: Pendapatan, Pengeluaran, Tagihan, Investasi, Cicilan)
        3. Ekstrak "Nominal":
        - Jika ditemukan angka dengan atau tanpa satuan (seperti: "500000", "5jt", "300 ribu"):
            - "k", "rb", "ribu" = x1000
            - "jt", "juta" = x1000000
            - "m", "milyar" = x1000000000
        - Jika angka tanpa satuan (misal: 500000), tetap anggap sebagai nominal dalam Rupiah.
        - Hapus simbol mata uang atau satuan.
        - Jika tidak ditemukan nominal valid, tetapkan ke 0.
        4. Keterangan (barang/jasa spesifik)
        5. Tanggal (format YYYY-MM-DD)

        Catatan tambahan:
        - Jika kata "tabungan", "simpanan", atau "deposito" disebutkan, maka kategori kemungkinan besar adalah "Investasi".
        - Jika ada kata yang menyatakan tanggal seperti "hari ini", "kemarin", "besok", gunakan tanggal tersebut tanggal {current_date}.
        - Jika tidak ada informasi tanggal, gunakan tanggal saat ini {current_date}.

        Berikan jawaban dalam format JSON:
        ```json
        {{
            "kategori": "[kategori]",
            "transaksi": "[tipe_transaksi]",
            "nominal": [nominal],
            "tanggal": "[tanggal]",
            "keterangan": "[keterangan]"
        }}

        Jika tidak ada informasi transaksi, gunakan format:
        {{
            "note": "Teks ini tidak tampak seperti transaksi keuangan. Jika ingin mencatat transaksi, coba gunakan format seperti 'beli kopi 15rb' atau 'gaji bulan ini 3jt'."
        }}
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

        generated_text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        json_match = re.search(r'```json\n(.*?)\n```', generated_text, re.DOTALL)
        if not json_match:
            logger.error(f"Tidak dapat menemukan JSON dalam respons Gemini: {generated_text}")
            raise Exception("Tidak dapat menemukan JSON dalam respons Gemini")

        json_str = json_match.group(1)
        data = json.loads(json_str)

        if "note" in data:
            logger.info(f"Gemini mengembalikan note: {data['note']}")
            return {"note": data["note"]}

        response_data = {
            "kategori": data.get("kategori", "Lain-lain"),
            "transaksi": data.get("transaksi", "Pengeluaran"),
            "nominal": data.get("nominal", 0),
            "tanggal": data.get("tanggal", current_date),
            "keterangan": data.get("keterangan", "Tidak spesifik")
        }

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

    
# Fungsi untuk memanggil DeepSeek API untuk teks (Keuangan)
def call_deepseek_api_keuangan(text: str):
    from dotenv import load_dotenv
    import os
    load_dotenv()

    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        logger.error("DEEPSEEK_API_KEY tidak ditemukan di environment variables")
        raise Exception("DEEPSEEK_API_KEY tidak ditemukan di environment variables")

    url = "https://api.deepseek.com/chat/completions"
    current_date = datetime.now().strftime("%Y-%m-%d")
    
    kategori_str = ", ".join(ALLOWED_KATEGORI)
    prompt = f"""
     Dari teks berikut: "{text}"
        Tentukan:
        1. kategori (pilih dari: {kategori_str})
        2. Tipe Transaksi (pilih dari: Pendapatan, Pengeluaran, Tagihan, Investasi, Cicilan)
        3. Ekstrak "Nominal":
        - Jika ditemukan angka dengan atau tanpa satuan (seperti: "500000", "5jt", "300 ribu"):
            - "k", "rb", "ribu" = x1000
            - "jt", "juta" = x1000000
            - "m", "milyar" = x1000000000
        - Jika angka tanpa satuan (misal: 500000), tetap anggap sebagai nominal dalam Rupiah.
        - Hapus simbol mata uang atau satuan.
        - Jika tidak ditemukan nominal valid, tetapkan ke 0.
        4. Keterangan (barang/jasa spesifik)
        5. Tanggal (format YYYY-MM-DD)

        Catatan tambahan:
        - Jika kata "tabungan", "simpanan", atau "deposito" disebutkan, maka kategori kemungkinan besar adalah "Investasi".
        - Jika ada kata yang menyatakan tanggal seperti "hari ini", "kemarin", "besok", gunakan tanggal tersebut tanggal {current_date}.
        - Jika tidak ada informasi tanggal, gunakan tanggal saat ini {current_date}.
        Berikan jawaban dalam format JSON:
        ```json
        {{
            "kategori": "[kategori]",
            "transaksi": "[tipe_transaksi]",
            "nominal": [nominal],
            "tanggal": "[tanggal]",
            "keterangan": "[keterangan]"
        }}

        Jika tidak ada informasi transaksi, gunakan format:
        {{
            "transactions": [],
            "note": "Teks ini tidak tampak seperti transaksi keuangan. Jika ingin mencatat transaksi, coba gunakan format seperti 'beli kopi 15rb' atau 'gaji bulan ini 3jt'."
        }}
    """

    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": prompt.strip()}
        ],
        "stream": False
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }

    try:
        logger.info(f"Memanggil DeepSeek API untuk teks: {text}")
        response = requests.post(url, json=payload, headers=headers, timeout=60)
        response.raise_for_status()
        result = response.json()
        generated_text = result.get("choices", [{}])[0].get("message", {}).get("content", "")

        import re
        json_match = re.search(r'```json\n(.*?)\n```', generated_text, re.DOTALL)
        if not json_match:
            logger.error(f"Tidak dapat menemukan JSON dalam respons DeepSeek: {generated_text}")
            raise Exception("Tidak dapat menemukan JSON dalam respons DeepSeek")

        json_str = json_match.group(1)
        data = json.loads(json_str)
        
        if "note" in data:
            logger.info(f"Gemini mengembalikan note: {data['note']}")
            return {"note": data["note"]}
    
        response_data = {
            "kategori": data.get("kategori", "Lain-lain"),
            "transaksi": data.get("transaksi", "Pengeluaran"),
            "nominal": data.get("nominal", 0),
            "tanggal": data.get("tanggal", current_date),
            "keterangan": data.get("keterangan", "Tidak spesifik")
        }

        logger.info(f"Hasil dari DeepSeek API: {response_data}")
        return response_data

    except requests.exceptions.RequestException as e:
        logger.error(f"Error jaringan saat memanggil DeepSeek API: {str(e)}")
        raise Exception(f"Error jaringan saat memanggil DeepSeek API: {str(e)}")
    except json.JSONDecodeError as e:
        logger.error(f"Gagal parsing JSON dari respons DeepSeek: {str(e)}")
        raise Exception(f"Gagal parsing JSON dari respons DeepSeek: {str(e)}")
    except Exception as e:
        logger.error(f"Kesalahan saat memproses respons DeepSeek: {str(e)}")
        raise Exception(f"Kesalahan saat memproses respons DeepSeek: {str(e)}")
    
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

    current_date = datetime.now().strftime("%Y-%m-%d")

    kategori_png_str = ", ".join(ALLOWED_KATEGORI_PNG)
    prompt = f"""
    Ambil data transaksi dari gambar struk ini. Untuk tiap item, berikan:
    1. kategori (pilih dari: {kategori_png_str})
    2. tipe_transaksi: Pendapatan / Pengeluaran / Tagihan / Investasi / Cicilan
    3. nominal: angka bulat, hilangkan Rp, titik, koma. Diskon = nilai negatif. Abaikan "Total", "Subtotal", dll.
    4. Keterangan (barang/jasa spesifik seperti yang tertulis) atau dari {caption} jika ada.
    5. tanggal: format YYYY-MM-DD, pakai hari ini jika tidak ada tanggal

    Instruksi tambahan:
    - Asumsikan struk adalah BUKTI PEMBELIAN oleh pengguna, jadi semua transaksi bertipe "Pengeluaran".
    - Jangan gunakan tipe "Pendapatan", kecuali sangat jelas bahwa struk adalah penjualan.
    - Jika nama item sudah cukup jelas (misalnya: kopi, teh, botol celup), gunakan kategori dari daftar sesuai konteks item tersebut.
    - Hindari default ke kategori "Pemasukan Lainnya" jika kategori seperti "Makanan & Minuman", "Bisnis", atau lainnya lebih cocok.
    - Jika caption menyebut kategori yang cocok, gunakan itu.
    - Gabungkan pajak (PPN, VAT, Tax) sebagai transaksi "Pengeluaran" dan kategori "Lain-lain", kecuali konteks menunjukkan sebaliknya.

    Jawab dengan JSON object:
    {{
    "transactions": [
        {{
        "kategori": "Makanan & Minuman",
        "tipe_transaksi": "Pengeluaran",
        "nominal": 15000,
        "tanggal": "2025-05-05",
        "keterangan": "kopi"
        }}
    ],
    "note": ""
    }}

    Jika gambar bukan struk, jawab:
    {{
    "transactions": [],
    "note": "Gambar ini bukan struk belanja."
    }}
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

        parsed_result = json.loads(cleaned_text)

        if isinstance(parsed_result, list):
            logger.warning("⚠️ Respons Gemini berupa list langsung, tidak dalam object dengan key 'transactions'")
            return {
                "transactions": parsed_result,
                "note": None
            }

        elif isinstance(parsed_result, dict):
            transactions_raw = parsed_result.get("transactions", [])
            note = parsed_result.get("note")
            return {
                "transactions": transactions_raw,
                "note": note
            }

        else:
            raise Exception("Struktur JSON dari Gemini tidak valid atau tidak dikenali")

    except json.JSONDecodeError as e:
        logger.error(f"Gagal mem-parse JSON: {cleaned_text}. Error: {e}")
        raise Exception(f"Respons JSON tidak valid dari Gemini API: {str(e)}")
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

        # Jika hasil berupa note, kembalikan langsung
        if "note" in result:
            return {"transactions": [], "note": result["note"]}

        # Jika hasil transaksi valid
        return {
            "transactions": [result],
            "note": None
        }

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
        result = call_gemini_image_api_keuangan(input.image, input.caption)

        # Jika hasil berupa dict dengan transactions dan note
        if isinstance(result, dict):
            transactions = result.get("transactions", [])
            note = result.get("note")
            return {
                "transactions": transactions,
                "note": note
            }
        else:
            # Backward compatibility jika hanya list dikembalikan
            return {"transactions": result}
    except Exception as e:
        logger.error(f"Error memproses gambar: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Terjadi kesalahan saat memproses gambar: {str(e)}")

@router.post("/process_voice_expense_keuangan")
async def process_voice_expense_keuangan(input: VoiceExpenseInput):
    try:
        result = call_gemini_voice_api_keuangan(input.file_base64)
        return result
    except Exception as e:
        logger.error(f"Error memproses voice note: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Terjadi kesalahan saat memproses voice note: {str(e)}")
    
def call_gemini_voice_api_keuangan(file_base64: str):
    from dotenv import load_dotenv
    import os
    load_dotenv()

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY tidak ditemukan di environment variables")
        raise Exception("GEMINI_API_KEY tidak ditemukan di environment variables")

    # 1. Upload file to Gemini File API
    file_upload_url = f"https://generativelanguage.googleapis.com/v1beta/files?key={api_key}"
    upload_headers = {"Content-Type": "application/json"}
    upload_payload = {
        "file": {
            "mimeType": "audio/mp3",
            "data": file_base64
        }
    }

    try:
        logger.info("Mengunggah file audio ke File API Gemini")
        upload_response = requests.post(file_upload_url, json=upload_payload, headers=upload_headers)
        upload_response.raise_for_status()
        file_result = upload_response.json()
        file_uri = file_result.get("name")  # e.g. "files/xxxx"
        if not file_uri:
            raise Exception("Upload file berhasil tapi file_uri tidak ditemukan")
    except Exception as e:
        logger.error(f"Gagal mengunggah file ke Gemini: {str(e)}")
        raise

    # 2. Kirim prompt dan fileUri ke generateContent
    gen_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"

    prompt = """
    Analisis konten dari voice note berikut.
    Apakah ada diskusi yang berkaitan dengan transaksi keuangan, seperti:
    - Pembelian atau penjualan barang/jasa?
    - Pembayaran atau transfer uang?
    - Penyebutan harga, jumlah, atau total biaya?
    - Konfirmasi pesanan atau kesepakatan jual beli?

    Jika ada, berikan ringkasan singkat mengenai indikasi transaksi tersebut.
    Jika tidak ada, balas "Tidak ditemukan transaksi yang relevan."
    """

    gen_payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "fileData": {
                            "mimeType": "audio/mp3",
                            "fileUri": file_uri
                        }
                    }
                ]
            }
        ]
    }

    try:
        logger.info("Memanggil Gemini API dengan fileUri untuk analisis voice note")
        response = requests.post(gen_url, json=gen_payload, headers=upload_headers)
        response.raise_for_status()
        result = response.json()
        generated_text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
        return {"summary": generated_text}
    except Exception as e:
        logger.error(f"Gagal memproses voice note dengan Gemini: {str(e)}")
        raise
    
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