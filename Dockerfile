# Etapa base
FROM node:20-bookworm-slim

# Configuración del entorno
ENV NODE_ENV=development
WORKDIR /app

# Instala dependencias del sistema necesarias para node-gyp, bcrypt, etc.
RUN apt-get update && apt-get install -y python3 build-essential openssl git \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copia package.json y lock (si existe)
COPY package*.json ./

# Instala dependencias
RUN npm install -g npm@latest
RUN npm install

# Copia el resto del código
COPY . .

# Expone el puerto que usa Medusa (9000)
EXPOSE 9000

# Comando por defecto (modo desarrollo)
CMD ["npm", "run", "dev"]
