import random
import math
import os

header = '''<!-- [2026-08-04] [SVG, Stitch-Bro, O(1), Animated Icon] - Organized by Gemini -->
<svg viewBox="0 0 1080 1920" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <style>
    @keyframes pulseAndShatter {
      0% { transform: scale(1); opacity: 1; }
      20% { transform: scale(1.1); opacity: 1; }
      40% { transform: scale(0.9); opacity: 1; }
      50% { transform: scale(4); opacity: 0; }
      100% { transform: scale(4); opacity: 0; }
    }
    @keyframes rainDrop {
      0%, 45% { transform: translate(0, 0) scale(0); opacity: 0; }
      50% { transform: translate(0, 0) scale(1); opacity: 1; }
      90%, 100% { transform: translate(var(--endX), var(--endY)) scale(var(--s)); opacity: 0; }
    }
    .logo {
      animation: pulseAndShatter 3s cubic-bezier(0.25, 1, 0.5, 1) forwards;
      transform-origin: 540px 960px;
    }
    .rain {
      animation: rainDrop 3s cubic-bezier(0.25, 1, 0.5, 1) forwards;
      font-family: monospace;
      font-weight: bold;
      opacity: 0;
      transform-origin: center;
    }
  </style>
  <rect width="100%" height="100%" fill="#030610"/>
  <g class="logo">
    <circle cx="540" cy="960" r="200" fill="none" stroke="#00ffcc" stroke-width="10"/>
    <text x="540" y="990" font-family="sans-serif" font-weight="900" font-size="120" fill="#ff00aa" text-anchor="middle">O(1)</text>
    <circle cx="540" cy="960" r="220" fill="none" stroke="#00a8ff" stroke-width="4" stroke-dasharray="20 10"/>
  </g>
'''

colors = ['#00ffcc', '#ff00aa', '#00a8ff', '#ffd700', '#39ff14']

os.makedirs(r'C:\Users\M\Desktop\o1edge.github.io\o1edge.github.io', exist_ok=True)
with open(r'C:\Users\M\Desktop\o1edge.github.io\o1edge.github.io\intro.svg', 'w') as f:
    f.write(header)
    for i in range(1, 101):
        angle = random.uniform(0, 2 * math.pi)
        dist = random.uniform(300, 1500)
        endX = math.cos(angle) * dist
        endY = math.sin(angle) * dist
        scale = random.uniform(1, 5)
        color = random.choice(colors)
        f.write(f'  <text class="rain" x="540" y="960" fill="{color}" font-size="40" style="--endX: {endX:.2f}px; --endY: {endY:.2f}px; --s: {scale:.2f};">{i}</text>\n')
    f.write('</svg>')
