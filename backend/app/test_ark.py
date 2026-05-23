# 解决中文乱码 + 稳定版本
from openai import OpenAI
import sys
import io

# 固定 Windows 终端乱码
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

client = OpenAI(
    api_key="ark-21be9f56-a3d9-4be5-99c8-52f515572ec0-7c1ea",  # 用你原来的就行
    base_url="https://ark.cn-beijing.volces.com/api/v3"
)

response = client.chat.completions.create(
    model="doubao-1-5-vision-pro-32k-250115",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": "https://picsum.photos/300"}},
                {"type": "text", "text": "描述这张图片"}
            ]
        }
    ]
)

print("模型回答：")
print(response.choices[0].message.content)