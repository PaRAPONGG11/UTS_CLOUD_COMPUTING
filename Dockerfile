# 1. Gunakan sistem operasi Linux ringan yang sudah ada Node.js-nya
FROM node:18-alpine

# 2. Tentukan di folder mana aplikasi akan ditaruh di dalam server
WORKDIR /usr/src/app

# 3. Copy file package.json terlebih dahulu
COPY package*.json ./

# 4. Install semua library (Express, MySQL2, AWS SDK, dll)
RUN npm install

# 5. Copy seluruh sisa kode aplikasi Anda (views, server.js, dll)
COPY . .

# 6. Buka port 5000 (sesuai dengan server.js Anda)
EXPOSE 3000

# 7. Perintah wajib untuk menjalankan aplikasi
CMD [ "npm", "start" ]