# BallBattlee — Custom SFX Pack

Bu ZIP paketda BallBattlee v20 simulyatori uchun maxsus **sintez qilingan original** (real obyekt ovozidan yozib olinmagan) yoqimli, qisqa SFX tovushlar mavjud. Har bir fayl alohida, 48 kHz mono, PCM 16-bit WAV. Ovozlarda clipping oldini olish uchun headroom qoldirilgan.

## Fayllar va voqealar

| Harakat | Fayllar | Qachon ishlatish |
| --- | --- | --- |
| Ingichka tarang ip uzilishi | string_snap_01…04.wav | Faqat haqiqiy ip uzilganda; 4 variantdan bittasini tanlang |
| Arena devoriga urilish | arena_wall_hit_01…02.wav | Fizik devor kolliziyasida |
| Ikki circle to‘qnashuvi | ball_collision_01…02.wav | Circle-circle to‘qnashuv payti |
| Circle kattalashishi | circle_growth.wav | O‘sish effekti faqat bir marta |
| Tezlik oshishi | speed_boost.wav | Tezlashish bosqichi boshlanishida, har frame emas |
| Ishtirokchi chiqib ketishi | participant_eliminated.wav | Ishtirokchi eliminatsiyasida |
| Finaldagi 2 ishtirokchi | final_duel.wav | 2 ta qolganida bir marta |
| G‘olib aniqlanishi | winner_reveal.wav | G‘alaba animatsiyasida bir marta |
| Jang boshlanishi | battle_start.wav | Start tugmasi bosilgach |
| UI bosish | ui_select.wav | Ixtiyoriy UI harakatlari uchun |
| Yirik o'tib ketish swishi | near_miss_whoosh.wav | Ixtiyoriy katta vizual near-miss hodisasi uchun, doimiy emas |

## Antigravity IDE integratsiyasi

1. `sfx/` ichidagi `.wav` fayllarni mavjud loyiha uchun mos asset papkaga (`public/sfx/` yoki mavjud boshqa joyga) ko‘chiring.
2. `sound-map.json` dagi `suggested_events` xaritasiga qarab mavjud o‘yin eventlariga ulang.
3. Barcha WAV fayllarni oldindan dekodlab, qayta ishlating. Har bir eventda faylni qayta download/decode qilmang.
4. **Bir dona fizik ip bitta logical `string_broken` event** berishi kerak. Uning bir necha marta chalinishiga yo‘l qo‘ymang.
5. String snap uchun sinov tariqasida 55 ms minimal eshitiladigan oraliq va 2 simultaneous voice limit qo‘ying. 90 ms dan eski navbatdagi tovushlarni ijro etmang. Ekrandagi iplarning uzilishi real-time ko‘rinishda davom etsin.
6. Audio limiter/soft gain boshqaruvidan foydalaning; bir vaqtning o‘zida chalinadigan tovushlar shovqinlashmasin. O‘yin musiqasiga nisbatan snap ovozi aniq eshitilishi kerak, lekin quloqqa qattiq urilmasin.
7. Oldingi sozlamalarni, yuklangan media fayllarni, gameplay va OBS yozuv ishini buzmasin. Faqat audio layerni ishonchli ulang.

**Eslatma:** Fayllar yoqimli arkada-uslubida sintez qilingan. `string_snap` haqiqiy ip snap'iga yaqinlashtirilgan, ammo bu mikrofonda yozilgan foley sample emas.

## Tinglash

`BallBattlee_SFX_Preview.mp3` ketma-ket SFX'lar namoyishi. Bu faylni o‘yinga qo‘shmang: o‘yin faqat alohida `sfx/*.wav` fayllardan foydalansin.
