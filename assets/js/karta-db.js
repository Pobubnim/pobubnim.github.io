/* ПОБУБНИМ — база реальных битрейтов камер для калькулятора карты памяти.
   ЗАКОН: только числа из технических спецификаций производителей (или их
   официальных мануалов/white paper). Ничего «типового» и выдуманного.
   У каждой камеры указан источник. Кодеки VBR (ProRes, BRAW, REDCODE) пишут
   «до» указанного — это целевые/максимальные значения из спеки.
   Формат: [подпись режима, Мбит/с]. Сверено 26.08.2026, EDU_BASE §8г. */

window.KARTA_DB = [
  {
    brand: "Смартфоны",
    cams: [
      {
        /* Apple: оценки места в настройках Камеры (190/440 МБ/мин) и
           требования к внешнему диску для ProRes (support.apple.com/109041:
           4K60 — 220 МБ/с, 4K120 — 440 МБ/с); ProRes-цели — white paper Apple */
        name: "iPhone (Pro)",
        modes: [
          ["4K 30p · HEVC (≈190 МБ/мин)", 25],
          ["4K 60p · HEVC (≈440 МБ/мин)", 60],
          ["4K 30p · ProRes 422 HQ", 884],
          ["4K 60p · ProRes 422 HQ", 1768],
          ["4K 120p · ProRes 422 HQ (внешний SSD)", 3520]
        ]
      }
    ]
  },
  {
    brand: "Sony",
    cams: [
      {
        /* спецификации Sony XAVC — битрейты одинаковы для линеек Alpha/FX
           (a7S III, a7 IV, FX3, FX30…): S-I 4K 240/250/300/500/600,
           S-I HD 89–222, XAVC S 4K 60–280 */
        name: "Sony Alpha / FX (a7S III, a7 IV, FX3, FX30)",
        modes: [
          ["4K 24p · XAVC S (H.264)", 100],
          ["4K 60p · XAVC S / HS", 200],
          ["4K 120p · XAVC S / HS", 280],
          ["4K 24p · XAVC S-I (All-Intra)", 240],
          ["4K 30p · XAVC S-I", 300],
          ["4K 60p · XAVC S-I", 600],
          ["1080 60p · XAVC S-I HD", 222],
          ["1080 50p · XAVC S HD", 50]
        ]
      },
      {
        /* спецификация Sony FX6: XAVC-I до 600, диапазон кодеков 35–600 */
        name: "Sony FX6 (Cinema Line)",
        modes: [
          ["4K 60p · XAVC-I (All-Intra)", 600],
          ["DCI 4K 24p · XAVC-I", 240],
          ["4K · XAVC Long GOP (минимум линейки)", 35]
        ]
      }
    ]
  },
  {
    brand: "Canon",
    cams: [
      {
        /* спецификации Canon EOS R5 (canon-europe.com) */
        name: "Canon EOS R5",
        modes: [
          ["8K 30p · RAW", 2600],
          ["8K 30p · RAW Light", 1700],
          ["8K 30p · All-I", 1300],
          ["8K 30p · IPB", 470],
          ["4K 120p · All-I", 1880],
          ["4K 60p · All-I", 940],
          ["4K 60p · IPB", 230],
          ["4K 30p · All-I", 470],
          ["4K 30p · IPB", 120]
        ]
      },
      {
        /* спецификации Canon EOS R6 Mark II */
        name: "Canon EOS R6 Mark II",
        modes: [
          ["4K 60p · IPB", 230],
          ["4K 60p · IPB Light", 120]
        ]
      },
      {
        /* спецификации Canon EOS C70 (canon.co.uk) */
        name: "Canon EOS C70",
        modes: [
          ["DCI 4K · XF-AVC All-I", 410],
          ["DCI 4K · Cinema RAW Light LT", 645]
        ]
      }
    ]
  },
  {
    brand: "Nikon",
    cams: [
      {
        /* онлайн-мануал Nikon Z8 (onlinemanual.nikonimglib.com), средние
           битрейты; ProRes 422 HQ — по таблице Apple */
        name: "Nikon Z8 / Z9",
        modes: [
          ["8.3K 60p · N-RAW", 5780],
          ["8.3K 30p · N-RAW", 3470],
          ["4.1K 60p · N-RAW", 1740],
          ["4K 30p · ProRes 422 HQ", 884],
          ["4K 60p · H.265 10-bit", 340],
          ["4K 30p · H.265 10-bit", 190]
        ]
      }
    ]
  },
  {
    brand: "Panasonic",
    cams: [
      {
        /* спецификации LUMIX GH6: ProRes 422 HQ 5.7K/30 — 1903 Мбит/с,
           All-Intra 4:2:2 10-bit — 800 */
        name: "Panasonic GH6",
        modes: [
          ["5.7K 30p · ProRes 422 HQ", 1903],
          ["4K · All-Intra 10-bit", 800]
        ]
      },
      {
        /* спецификации LUMIX S5 II (макс. 200) и S5 IIX (All-I до 800) */
        name: "Panasonic S5 II / S5 IIX",
        modes: [
          ["6K/4K · Long GOP 10-bit (макс. S5 II)", 200],
          ["C4K · All-Intra (только S5 IIX)", 800]
        ]
      }
    ]
  },
  {
    brand: "Fujifilm",
    cams: [
      {
        /* спецификации X-H2S: H.265 720/360/200/100/50;
           ProRes 422 HQ 6.2K/30 ≈ 2754 Мбит/с (≈344 МБ/с) */
        name: "Fujifilm X-H2S",
        modes: [
          ["6.2K 30p · ProRes 422 HQ", 2754],
          ["6.2K/4K · H.265 (макс.)", 720],
          ["4K · H.265", 360]
        ]
      }
    ]
  },
  {
    brand: "Blackmagic",
    cams: [
      {
        /* мануал BMD Pocket 6K: BRAW 6K constant bitrate в МБ/с:
           3:1 — 323, 5:1 — 194, 8:1 — 121, 12:1 — 81 */
        name: "BMD Pocket 6K / 6K Pro",
        modes: [
          ["6K · BRAW 3:1 (323 МБ/с)", 2584],
          ["6K · BRAW 5:1 (194 МБ/с)", 1552],
          ["6K · BRAW 8:1 (121 МБ/с)", 968],
          ["6K · BRAW 12:1 (81 МБ/с)", 648]
        ]
      },
      {
        /* мануал BMD Pocket 4K: BRAW 4K DCI 24p 12:1 — 227 Мбит/с */
        name: "BMD Pocket 4K",
        modes: [
          ["DCI 4K 24p · BRAW 12:1", 227]
        ]
      }
    ]
  },
  {
    brand: "RED",
    cams: [
      {
        /* спецификации RED KOMODO: до 280 МБ/с (CFast 2.0); MQ ≈ 175 МБ/с */
        name: "RED KOMODO 6K",
        modes: [
          ["6K · REDCODE HQ (до 280 МБ/с)", 2240],
          ["6K · REDCODE MQ (≈175 МБ/с)", 1400]
        ]
      },
      {
        /* спецификации RED V-RAPTOR: до 800 МБ/с (CFexpress) */
        name: "RED V-RAPTOR 8K",
        modes: [
          ["8K · REDCODE HQ (до 800 МБ/с)", 6400]
        ]
      }
    ]
  },
  {
    brand: "ARRI",
    cams: [
      {
        /* тех. данные ARRI ALEXA Mini LF: ARRIRAW UHD 24p — 2393 Мбит/с
           (≈1,08 ТБ/час); Open Gate 4.5K 25p ≈ 1,9 ТБ/час (≈4200 Мбит/с) */
        name: "ARRI ALEXA Mini LF",
        modes: [
          ["4.5K Open Gate 25p · ARRIRAW (≈1,9 ТБ/ч)", 4200],
          ["UHD 24p · ARRIRAW (≈1,08 ТБ/ч)", 2393],
          ["UHD 24p · ProRes 4444 XQ", 1591]
        ]
      }
    ]
  },
  {
    brand: "DJI",
    cams: [
      {
        /* спецификации DJI Mavic 3 / Mavic 3 Cine */
        name: "DJI Mavic 3 (Cine)",
        modes: [
          ["5.1K · ProRes 422 HQ", 3772],
          ["5.1K · ProRes 422", 2514],
          ["5.1K · ProRes 422 LT", 1750],
          ["5.1K/4K · H.264/H.265 (макс.)", 200]
        ]
      },
      {
        /* спецификации DJI: Max Video Bitrate 150 Мбит/с */
        name: "DJI Mini 3 Pro / Mini 4 Pro",
        modes: [
          ["4K · H.264/H.265 (макс.)", 150]
        ]
      },
      {
        /* спецификации DJI Osmo Pocket 3 и Osmo Action 4: макс. 130 */
        name: "DJI Osmo Pocket 3 / Action 4",
        modes: [
          ["4K · H.264/H.265 (макс.)", 130]
        ]
      }
    ]
  },
  {
    brand: "GoPro",
    cams: [
      {
        /* спецификации GoPro: высокий битрейт 5.3K — 120 Мбит/с */
        name: "GoPro HERO 12 / 13",
        modes: [
          ["5.3K/4K · HEVC высокий битрейт", 120]
        ]
      }
    ]
  },
  {
    brand: "Рекордеры (Apple ProRes)",
    cams: [
      {
        /* официальная таблица Apple ProRes White Paper (апрель 2022),
           целевые битрейты; полная таблица до 8K — в EDU_BASE §8г */
        name: "Внешний рекордер (Atomos и др.)",
        modes: [
          ["1080 25p · ProRes 422 HQ", 184],
          ["1080 50p · ProRes 422 HQ", 367],
          ["UHD 25p · ProRes 422", 492],
          ["UHD 25p · ProRes 422 HQ", 737],
          ["UHD 30p · ProRes 422 HQ", 884],
          ["UHD 50p · ProRes 422 HQ", 1475],
          ["UHD 60p · ProRes 422 HQ", 1768],
          ["UHD 25p · ProRes 4444", 1106],
          ["UHD 25p · ProRes 422 Proxy", 151]
        ]
      }
    ]
  }
];
