FROM python:3.9

   WORKDIR /app

   RUN pip3 install --no-cache-dir --upgrade pip

   COPY requirements.txt .
   RUN pip3 install --no-cache-dir --timeout=1000 --retries=5 -r requirements.txt

   COPY . .

   EXPOSE 8000

   CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]