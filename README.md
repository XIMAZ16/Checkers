# CHECKERS — Retro Arcade

หมากฮอส 8×8 (ฮอสเดินได้กี่ช่องก็ได้) ธีม Retro Arcade โครงสร้างไฟล์เหมือนเกม XO / Quoridor เดิม

```text
checkers/
├── index.html      # โครงหน้าเว็บ, scoreboard, lobby, dialogs
├── style.css       # ธีม Retro Arcade (ใช้ธีมเดียวกับเกมเดิม)
├── game.js         # กติกา, state, UI controller, ระบบห้องออนไลน์
├── ai.js           # บอท 3 ระดับ (minimax + alpha-beta)
├── audio.js        # เสียง 8-bit
├── net.js          # PubNub / BroadcastChannel
└── net-config.js   # PubNub publish/subscribe keys ฝั่ง client
```

รัน: วางทุกไฟล์ในโฟลเดอร์เดียวกัน แล้วเปิดผ่าน web server (เช่น `python -m http.server 8000`) หรือดีพลอยบน Vercel

กติกา: เดินเฉียงหน้า, บังคับกิน, กินต่อเนื่อง, ถึงแถวสุดท้ายเป็นฮอส (เดินเฉียงได้กี่ช่องก็ได้ทั้งหน้าหลัง กินแบบข้ามไกลและลงช่องว่างช่องไหนก็ได้ถัดไป), เสมอเมื่อ 80 ตานับจากการกิน/เดินหมากธรรมดาครั้งล่าสุด

ออนไลน์: เจ้าของห้องเป็น X (ตัดสินกติกา) ผู้เข้าร่วมเป็น O ส่ง/รับผ่านช่อง `checkers-arcade-<รหัสห้อง>` ถ้าไม่ใส่คีย์ใน `net-config.js` จะเล่นได้เฉพาะแท็บในเบราว์เซอร์เดียวกัน
