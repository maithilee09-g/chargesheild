# Stage 1: Build the React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Production Python Backend & ML Runtime
FROM python:3.11-slim AS runner

WORKDIR /app

# Install system utilities and build dependencies for FAISS / C++ libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download SentenceTransformer model weights at image build time
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

# Copy source code, models, reports, and backend
COPY src/ ./src/
COPY models/ ./models/
COPY reports/ ./reports/
COPY backend/ ./backend/

# Copy built frontend assets from Stage 1 into the runtime container
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose standard web port
ENV PORT=8000
EXPOSE 8000

# Start FastAPI Uvicorn server
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
