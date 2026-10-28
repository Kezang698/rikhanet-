FROM python:3.13-slim
WORKDIR /app
ARG WITH_TFT=1
COPY backend/requirements.txt backend/requirements-prediction.txt /tmp/
RUN if [ "$WITH_TFT" = "1" ]; then \
      pip install --no-cache-dir 'torch>=2.8,<3' --index-url https://download.pytorch.org/whl/cpu && \
      pip install --no-cache-dir -r /tmp/requirements-prediction.txt; \
    else pip install --no-cache-dir -r /tmp/requirements.txt; fi
COPY backend /app/backend
EXPOSE 8000
CMD ["python", "-m", "backend"]
