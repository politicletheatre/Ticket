#!/bin/bash
# embed-poster.sh — แปลงรูป poster เป็น base64 และ inject เข้า index.html
# วิธีใช้: bash embed-poster.sh

POSTER_SRC="/Users/user/.gemini/antigravity/brain/92f2f616-ac20-4c25-864f-d88390fea68c/theater_poster_1780324990258.png"
PROJECT="/Users/user/.gemini/antigravity/scratch/theater-tickets"
OUT_JS="$PROJECT/assets/poster-data.js"

echo "Encoding poster..."
B64=$(base64 -i "$POSTER_SRC")
echo "window.POSTER_BASE64 = '$B64';" > "$OUT_JS"
echo "Done! poster-data.js written ($(wc -c < "$OUT_JS") bytes)"
