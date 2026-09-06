/* Reading material: the rules behind the words, grouped per HSK level,
   plus a bank of gap-fill sentences. Plain data — no UI code in here.

   RULES[]  { id, level, group, marker, title, en, de, examples[[zh,pinyin,en]], check?{q,options,answer,note} }
   CLOZE[]  { id, level, text (contains ___), options[], answer, pinyin, en, why, tag } */

export const RULE_GROUPS = [
  { key: "sound", label: "Sound & tones", hanzi: "音" },
  { key: "order", label: "Word order", hanzi: "序" },
  { key: "particles", label: "Particles & markers", hanzi: "词" },
  { key: "verbs", label: "Verbs & complements", hanzi: "动" },
  { key: "connect", label: "Linking ideas", hanzi: "连" }
];

export const RULES = [
  /* ---------------- HSK 1 ---------------- */
  {
    id: "r-sandhi-33", level: 1, group: "sound", marker: "3 + 3", title: "Two third tones in a row",
    en: "When two third tones meet, the first one is said as a second tone. 你好 is written nǐ hǎo but spoken ní hǎo. The spelling never changes — only your mouth does. This is the single most audible rule in Mandarin, and it applies inside words as well as across word boundaries.",
    de: "Treffen zwei dritte Töne aufeinander, wird der erste wie ein zweiter Ton gesprochen. 你好 schreibt man nǐ hǎo, spricht aber ní hǎo. Die Schreibung ändert sich nie — nur die Aussprache. Die Regel gilt innerhalb von Wörtern wie auch über Wortgrenzen hinweg.",
    examples: [
      ["你好", "nǐ hǎo → ní hǎo", "hello"],
      ["很好", "hěn hǎo → hén hǎo", "very good"],
      ["水果", "shuǐguǒ → shuíguǒ", "fruit"]
    ],
    check: { q: "How is 我很好 actually pronounced?", options: ["wǒ hěn hǎo", "wó hén hǎo", "wǒ hén hǎo", "wó hěn hào"], answer: 2,
      note: "Work from the right: the last 好 keeps tone 3, 很 becomes tone 2. 我 stays third tone as a light dip." }
  },
  {
    id: "r-sandhi-half", level: 1, group: "sound", marker: "半三声", title: "The half third tone",
    en: "A third tone before any other tone is not the full dip-and-rise you learn in isolation. It only falls low and stays there. The full rising tail appears at the end of a phrase or when the syllable stands alone.",
    de: "Ein dritter Ton vor einem anderen Ton ist nicht das volle Fallen-und-Steigen aus der Einzelübung. Er fällt nur tief und bleibt dort. Der steigende Teil erscheint nur am Phrasenende oder wenn die Silbe allein steht.",
    examples: [
      ["老师", "lǎoshī", "teacher (low 老, then high 师)"],
      ["很忙", "hěn máng", "very busy"],
      ["好", "hǎo", "good (full dip and rise on its own)"]
    ],
    check: { q: "In 好吃 (hǎochī), how is 好 spoken?", options: ["Full dip and rise", "Low and flat, no rise", "Like a fourth tone", "Neutral"], answer: 1,
      note: "Before another tone the third tone keeps only its low part." }
  },
  {
    id: "r-sandhi-bu", level: 1, group: "sound", marker: "不", title: "不 changes before a fourth tone",
    en: "不 is bù by default, but becomes bú in front of a fourth tone. 不是 is bú shì, 不去 is bú qù. Unlike the third-tone rule, this one is usually written out in pinyin.",
    de: "不 ist standardmäßig bù, wird aber vor einem vierten Ton zu bú. 不是 ist bú shì, 不去 ist bú qù. Anders als beim dritten Ton wird das im Pinyin meist mitgeschrieben.",
    examples: [
      ["不是", "bú shì", "is not (是 is fourth tone)"],
      ["不好", "bù hǎo", "not good (好 is third tone, so 不 stays bù)"],
      ["不去", "bú qù", "not going"]
    ],
    check: { q: "Which is correct?", options: ["bù duì", "bú duì", "bǔ duì", "bu duì"], answer: 1,
      note: "对 (duì) is a fourth tone, so 不 becomes bú." }
  },
  {
    id: "r-sandhi-yi", level: 1, group: "sound", marker: "一", title: "The three faces of 一",
    en: "一 is yī when counting, in dates and in phone numbers. Before a fourth tone it becomes yí. Before a first, second or third tone it becomes yì.",
    de: "一 ist yī beim Zählen, in Daten und Telefonnummern. Vor einem vierten Ton wird es zu yí, vor einem ersten, zweiten oder dritten Ton zu yì.",
    examples: [
      ["一二三", "yī èr sān", "one two three (counting: yī)"],
      ["一个", "yí ge", "one (个 is fourth tone)"],
      ["一起", "yìqǐ", "together (起 is third tone)"]
    ],
    check: { q: "How is 一天 pronounced?", options: ["yī tiān", "yì tiān", "yí tiān", "yi tiān"], answer: 1,
      note: "天 is a first tone, so 一 becomes yì." }
  },
  {
    id: "r-neutral", level: 1, group: "sound", marker: "轻声", title: "The neutral tone",
    en: "Some syllables carry no tone at all: they are short, light and take their pitch from what came before. This covers grammatical particles (的, 了, 吗, 吧), the second half of doubled family words (妈妈, 哥哥) and the second syllable of many everyday compounds (朋友, 东西).",
    de: "Manche Silben tragen gar keinen Ton: kurz, leicht, die Tonhöhe kommt von der vorherigen Silbe. Das betrifft grammatische Partikeln (的, 了, 吗, 吧), die zweite Hälfte verdoppelter Verwandtschaftswörter (妈妈, 哥哥) und die zweite Silbe vieler Alltagswörter (朋友, 东西).",
    examples: [
      ["妈妈", "māma", "mum"],
      ["朋友", "péngyou", "friend"],
      ["你呢", "nǐ ne", "and you?"]
    ],
    check: { q: "Which syllable is neutral in 谢谢 (xièxie)?", options: ["The first", "The second", "Both", "Neither"], answer: 1,
      note: "In doubled words the second syllable goes light." }
  },
  {
    id: "r-pinyin-spelling", level: 1, group: "sound", marker: "拼音", title: "Pinyin spells less than it says",
    en: "A few pinyin spellings are shortcuts. iu is really iou (liù sounds like li-ou), ui is really uei (duì sounds like du-ei), un is really uen. And ü loses its dots after j, q, x and y — ju is really jü.",
    de: "Einige Pinyin-Schreibungen sind Abkürzungen. iu steht für iou (liù klingt wie li-ou), ui für uei (duì wie du-ei), un für uen. Und ü verliert nach j, q, x, y seine Punkte — ju ist eigentlich jü.",
    examples: [
      ["六", "liù = li-ou", "six"],
      ["对", "duì = du-ei", "correct"],
      ["去", "qù = qü", "to go"]
    ],
    check: { q: "In 去 (qù), how is the vowel actually pronounced?", options: ["like u in Suppe", "like ü in über", "like o", "silent"], answer: 1,
      note: "After j, q, x and y a written u is always ü." }
  },
  {
    id: "r-order-basic", level: 1, group: "order", marker: "语序", title: "Time, place, then verb",
    en: "The backbone is subject – verb – object, like English. What differs is everything else: time and place come before the verb, never after it. The order runs from big frame to small action: who – when – where – how – what they do.",
    de: "Das Grundgerüst ist Subjekt – Verb – Objekt wie im Deutschen. Anders ist alles andere: Zeit und Ort stehen vor dem Verb, nie danach. Die Reihenfolge geht vom großen Rahmen zur konkreten Handlung: wer – wann – wo – wie – was.",
    examples: [
      ["我明天去北京。", "Wǒ míngtiān qù Běijīng.", "I'm going to Beijing tomorrow."],
      ["他在家看电视。", "Tā zài jiā kàn diànshì.", "He watches TV at home."],
      ["我们明天在学校见面。", "Wǒmen míngtiān zài xuéxiào jiànmiàn.", "We'll meet at school tomorrow."]
    ],
    check: { q: "Which word order is correct?", options: ["我去北京明天。", "明天我去北京。", "我去明天北京。", "去我北京明天。"], answer: 1,
      note: "Time can start the sentence or follow the subject, but never trails the verb." }
  },
  {
    id: "r-no-inflection", level: 1, group: "order", marker: "无变形", title: "Words never change shape",
    en: "There is no conjugation, no plural -s, no articles and no gender. 去 is go, went and will go. Time is carried by words like 昨天, 已经 or 了, not by the verb itself — so once you know a word, you know all its forms.",
    de: "Es gibt keine Konjugation, keinen Plural, keine Artikel, kein Genus. 去 heißt gehen, ging und wird gehen. Die Zeit tragen Wörter wie 昨天, 已经 oder 了, nicht das Verb — wer ein Wort kennt, kennt alle Formen.",
    examples: [
      ["我昨天去。", "Wǒ zuótiān qù.", "I went yesterday."],
      ["我明天去。", "Wǒ míngtiān qù.", "I'll go tomorrow."],
      ["三个学生", "sān ge xuéshēng", "three students (no plural ending)"]
    ]
  },
  {
    id: "r-questions", level: 1, group: "order", marker: "问句", title: "Three ways to ask",
    en: "Chinese questions keep statement word order. Add 吗 at the end for yes/no; put a question word exactly where the answer would stand; or repeat the verb in its positive and negative form (A-not-A).",
    de: "Fragen behalten die Wortstellung der Aussage. 吗 am Ende für Ja/Nein; das Fragewort steht genau dort, wo die Antwort stünde; oder Verb positiv und negativ hintereinander (A-nicht-A).",
    examples: [
      ["你是学生吗？", "Nǐ shì xuéshēng ma?", "Are you a student?"],
      ["你去哪儿？", "Nǐ qù nǎr?", "Where are you going?"],
      ["你去不去？", "Nǐ qù bu qù?", "Are you going or not?"]
    ],
    check: { q: "How do you ask 'What are you drinking?'", options: ["什么你喝？", "你喝什么？", "你什么喝吗？", "喝你什么？"], answer: 1,
      note: "The question word sits where the answer would go — after the verb." }
  },
  {
    id: "r-measure", level: 1, group: "particles", marker: "量词", title: "Numbers need a measure word",
    en: "You cannot put a number straight in front of a noun. Number + measure word + noun is obligatory: 三个人, 两本书. 个 is the general-purpose one. And 'two' before a measure word is 两, not 二.",
    de: "Eine Zahl steht nie direkt vor dem Nomen. Zahl + Zählwort + Nomen ist Pflicht: 三个人, 两本书. 个 ist das Allzweck-Zählwort. „Zwei“ vor einem Zählwort heißt 两, nicht 二.",
    examples: [
      ["三个人", "sān ge rén", "three people"],
      ["两本书", "liǎng běn shū", "two books"],
      ["一杯水", "yì bēi shuǐ", "a glass of water"]
    ],
    check: { q: "Which is correct for 'two cups of tea'?", options: ["二杯茶", "两杯茶", "两茶", "二茶杯"], answer: 1,
      note: "两 is used with measure words; 二 is for counting and numbers." }
  },
  {
    id: "r-negation", level: 1, group: "particles", marker: "不 / 没", title: "不 or 没",
    en: "不 negates the present, the habitual and the intended: 我不喝咖啡. 没 negates something that did not happen or has not happened yet: 我没去. And 有 is always negated with 没 — 没有, never 不有.",
    de: "不 verneint Gegenwart, Gewohnheit und Absicht: 我不喝咖啡. 没 verneint, was nicht passiert ist oder noch nicht passiert ist: 我没去. 有 wird immer mit 没 verneint — 没有, nie 不有.",
    examples: [
      ["我不去。", "Wǒ bú qù.", "I'm not going."],
      ["我没去。", "Wǒ méi qù.", "I didn't go."],
      ["我没有时间。", "Wǒ méiyǒu shíjiān.", "I don't have time."]
    ],
    check: { q: "Which negation fits 'I didn't eat'?", options: ["我不吃饭。", "我没吃饭。", "我不有吃饭。", "我吃不饭。"], answer: 1,
      note: "没 negates a past event; 不 would mean you don't eat as a rule." }
  },
  {
    id: "r-hen", level: 1, group: "particles", marker: "很", title: "Adjectives are verbs",
    en: "An adjective already contains 'to be', so 是 is not used with it. A bare adjective sounds like a comparison, so 很 steps in as a neutral link — in 我很忙 it barely means 'very' at all.",
    de: "Ein Adjektiv enthält das „sein“ bereits, deshalb steht kein 是 dabei. Ein nacktes Adjektiv klingt nach Vergleich, deshalb tritt 很 als neutrale Verbindung ein — in 我很忙 heißt es kaum „sehr“.",
    examples: [
      ["我很忙。", "Wǒ hěn máng.", "I'm busy."],
      ["天气很好。", "Tiānqì hěn hǎo.", "The weather is nice."],
      ["他不高。", "Tā bù gāo.", "He isn't tall (negation replaces 很)."]
    ],
    check: { q: "Which sentence is natural?", options: ["她是漂亮。", "她很漂亮。", "她是很漂亮的。", "她漂亮是。"], answer: 1,
      note: "No 是 in front of an adjective; 很 links subject and adjective." }
  },

  /* ---------------- HSK 2 ---------------- */
  {
    id: "r-le-two", level: 2, group: "particles", marker: "了", title: "The two jobs of 了",
    en: "了 straight after the verb says the action is complete: 我买了一本书. 了 at the end of the sentence says something has changed or is new: 下雨了 (it has started raining). Sometimes both appear at once. 了 is not a past tense — 明天我就去了 is future.",
    de: "了 direkt nach dem Verb heißt: Handlung abgeschlossen — 我买了一本书. 了 am Satzende heißt: etwas hat sich geändert — 下雨了 (es hat angefangen zu regnen). Manchmal stehen beide. 了 ist keine Vergangenheitsform — 明天我就去了 ist Zukunft.",
    examples: [
      ["我买了一本书。", "Wǒ mǎi le yì běn shū.", "I bought a book (completed)."],
      ["下雨了。", "Xià yǔ le.", "It's raining now (change)."],
      ["我没买书。", "Wǒ méi mǎi shū.", "I didn't buy a book (了 disappears when negated)."]
    ],
    check: { q: "What does 我会说汉语了 mean?", options: ["I spoke Chinese", "I can speak Chinese now (new ability)", "I will speak Chinese", "I cannot speak Chinese"], answer: 1,
      note: "Sentence-final 了 marks a new situation." }
  },
  {
    id: "r-guo", level: 2, group: "verbs", marker: "过", title: "过 — the experience marker",
    en: "过 says you have done something at least once in your life, without pinning it to a moment: 我去过中国. 了 reports one specific completed event. The negation is 没…过, and 过 stays put.",
    de: "过 sagt, dass man etwas mindestens einmal erlebt hat, ohne Zeitpunkt: 我去过中国. 了 berichtet ein bestimmtes abgeschlossenes Ereignis. Die Verneinung ist 没…过, wobei 过 stehen bleibt.",
    examples: [
      ["我去过中国。", "Wǒ qù guo Zhōngguó.", "I've been to China."],
      ["我没吃过饺子。", "Wǒ méi chī guo jiǎozi.", "I've never eaten dumplings."],
      ["昨天我去了公园。", "Zuótiān wǒ qù le gōngyuán.", "Yesterday I went to the park (one event)."]
    ],
    check: { q: "Which sentence says 'I have never been there'?", options: ["我不去那儿。", "我没去过那儿。", "我没去了那儿。", "我不去过那儿。"], answer: 1,
      note: "没 + verb + 过 is the standard negative experience." }
  },
  {
    id: "r-bi", level: 2, group: "order", marker: "比", title: "Comparing with 比",
    en: "A 比 B + adjective, and the 很 must go: 他比我高, never 他比我很高. To say how much bigger the gap is, add it after the adjective: 高一点儿, 高很多. For 'not as … as', use 没有: 我没有他高.",
    de: "A 比 B + Adjektiv, und 很 muss weg: 他比我高, nie 他比我很高. Den Abstand hängt man hinten an: 高一点儿, 高很多. Für „nicht so … wie“ nimmt man 没有: 我没有他高.",
    examples: [
      ["他比我高。", "Tā bǐ wǒ gāo.", "He is taller than me."],
      ["他比我高一点儿。", "Tā bǐ wǒ gāo yìdiǎnr.", "He is a bit taller than me."],
      ["我没有他高。", "Wǒ méiyǒu tā gāo.", "I'm not as tall as he is."]
    ],
    check: { q: "Which comparison is correct?", options: ["今天比昨天很热。", "今天比昨天热。", "今天很比昨天热。", "今天比昨天太热。"], answer: 1,
      note: "比 sentences never take 很 or 太 before the adjective." }
  },
  {
    id: "r-de-degree", level: 2, group: "verbs", marker: "得", title: "得 — how well you do it",
    en: "To judge the manner of an action, use verb + 得 + description: 他说得很好. If there is an object, either repeat the verb (他说汉语说得很好) or move the object to the front (他汉语说得很好).",
    de: "Um die Art einer Handlung zu bewerten: Verb + 得 + Beschreibung: 他说得很好. Mit Objekt entweder das Verb wiederholen (他说汉语说得很好) oder das Objekt nach vorne ziehen (他汉语说得很好).",
    examples: [
      ["他跑得很快。", "Tā pǎo de hěn kuài.", "He runs fast."],
      ["她汉语说得很好。", "Tā Hànyǔ shuō de hěn hǎo.", "She speaks Chinese well."],
      ["我睡得不好。", "Wǒ shuì de bù hǎo.", "I didn't sleep well."]
    ],
    check: { q: "Which sentence is correct?", options: ["他说汉语得很好。", "他说得汉语很好。", "他汉语说得很好。", "他得说汉语很好。"], answer: 2,
      note: "得 attaches to the verb, so the object has to move out of the way." }
  },
  {
    id: "r-time-duration", level: 2, group: "order", marker: "时间", title: "When versus how long",
    en: "A point in time comes before the verb: 我七点起床. A stretch of time comes after it: 我学了两个小时. Getting these two the wrong way round is one of the most common mistakes at this level.",
    de: "Ein Zeitpunkt steht vor dem Verb: 我七点起床. Eine Zeitdauer steht danach: 我学了两个小时. Diese beiden zu vertauschen ist einer der häufigsten Fehler auf diesem Niveau.",
    examples: [
      ["我七点起床。", "Wǒ qī diǎn qǐchuáng.", "I get up at seven."],
      ["我学了两个小时。", "Wǒ xué le liǎng ge xiǎoshí.", "I studied for two hours."],
      ["他等了我半个小时。", "Tā děng le wǒ bàn ge xiǎoshí.", "He waited half an hour for me."]
    ],
    check: { q: "Where does 三年 go in 'I lived in China for three years'?", options: ["我三年在中国住了。", "我在中国住了三年。", "三年我在中国住。", "我住三年在中国。"], answer: 1,
      note: "Duration follows the verb." }
  },
  {
    id: "r-adverbs", level: 2, group: "order", marker: "也 都 就 还", title: "Adverbs live before the verb",
    en: "也, 都, 就, 还, 只 and friends sit after the subject and before the verb — never at the start of the sentence. 都 additionally has to follow whatever it sums up, which is why 都 comes after the plural subject, not before it.",
    de: "也, 都, 就, 还, 只 und Co. stehen nach dem Subjekt und vor dem Verb — nie am Satzanfang. 都 muss zusätzlich nach dem stehen, was es zusammenfasst, also nach dem Subjekt im Plural.",
    examples: [
      ["我也去。", "Wǒ yě qù.", "I'm going too."],
      ["我们都是学生。", "Wǒmen dōu shì xuéshēng.", "We are all students."],
      ["他还在工作。", "Tā hái zài gōngzuò.", "He is still working."]
    ],
    check: { q: "Which is correct for 'We all like tea'?", options: ["都我们喜欢茶。", "我们都喜欢茶。", "我们喜欢都茶。", "我们喜欢茶都。"], answer: 1,
      note: "都 follows the group it refers to and precedes the verb." }
  },
  {
    id: "r-reduplication", level: 2, group: "verbs", marker: "看看", title: "Doubling a verb softens it",
    en: "Repeating a verb makes the action brief and casual: 看看 (have a quick look), 试试 (give it a try). One-syllable verbs can also take 一 in the middle (看一看) or 一下 after them (等一下). It is the polite way to ask for something small.",
    de: "Ein verdoppeltes Verb macht die Handlung kurz und beiläufig: 看看 (mal schauen), 试试 (mal probieren). Einsilbige Verben können auch 一 in die Mitte nehmen (看一看) oder 一下 anhängen (等一下). So klingt eine kleine Bitte höflich.",
    examples: [
      ["我看看。", "Wǒ kànkan.", "Let me have a look."],
      ["你试一试。", "Nǐ shì yi shì.", "Give it a try."],
      ["请等一下。", "Qǐng děng yíxià.", "Please wait a moment."]
    ]
  },
  {
    id: "r-big-small", level: 2, group: "order", marker: "大到小", title: "Always big to small",
    en: "Dates, times, addresses and names all run from the largest unit to the smallest — the opposite of English. Year, month, day; city, street, number; family name, then given name.",
    de: "Datum, Uhrzeit, Adressen und Namen laufen immer von der größten zur kleinsten Einheit — umgekehrt zum Deutschen. Jahr, Monat, Tag; Stadt, Straße, Nummer; Familienname, dann Vorname.",
    examples: [
      ["二〇二六年五月三号", "èr líng èr liù nián wǔ yuè sān hào", "3 May 2026"],
      ["明天早上八点", "míngtiān zǎoshang bā diǎn", "tomorrow morning at eight"],
      ["中国北京", "Zhōngguó Běijīng", "Beijing, China"]
    ],
    check: { q: "Which order is right?", options: ["三号五月二〇二六年", "二〇二六年五月三号", "五月三号二〇二六年", "三号二〇二六年五月"], answer: 1,
      note: "Year, then month, then day." }
  },
  {
    id: "r-li-cong", level: 2, group: "particles", marker: "离 / 从", title: "离 for distance, 从 for the starting point",
    en: "离 measures the gap between two places and is followed by 远 or 近: 我家离学校很近. 从 marks where a movement begins and pairs with 到: 从北京到上海.",
    de: "离 misst den Abstand zwischen zwei Orten und steht mit 远 oder 近: 我家离学校很近. 从 markiert den Ausgangspunkt und steht mit 到: 从北京到上海.",
    examples: [
      ["我家离公司很远。", "Wǒ jiā lí gōngsī hěn yuǎn.", "My home is far from the office."],
      ["从家到学校要十分钟。", "Cóng jiā dào xuéxiào yào shí fēnzhōng.", "It takes ten minutes from home to school."]
    ],
    check: { q: "Which preposition fits: 我家___学校很近?", options: ["从", "离", "到", "在"], answer: 1,
      note: "离 + 远/近 measures distance." }
  },
  {
    id: "r-yidianr", level: 2, group: "particles", marker: "一点儿 / 有点儿", title: "一点儿 versus 有点儿",
    en: "有点儿 goes before an adjective and carries a complaint: 有点儿贵 (a bit too expensive). 一点儿 goes after the adjective or verb and is neutral: 便宜一点儿 (a bit cheaper, please).",
    de: "有点儿 steht vor dem Adjektiv und drückt Unzufriedenheit aus: 有点儿贵 (etwas zu teuer). 一点儿 steht nach dem Adjektiv oder Verb und ist neutral: 便宜一点儿 (etwas billiger bitte).",
    examples: [
      ["这个有点儿贵。", "Zhège yǒudiǎnr guì.", "This is a bit too expensive."],
      ["便宜一点儿吧。", "Piányi yìdiǎnr ba.", "A bit cheaper, please."]
    ],
    check: { q: "How do you complain that the food is a bit salty?", options: ["菜咸一点儿。", "菜有点儿咸。", "菜一点儿咸。", "菜咸有点儿。"], answer: 1,
      note: "有点儿 before the adjective carries the negative nuance." }
  },

  /* ---------------- HSK 3 ---------------- */
  {
    id: "r-three-de", level: 3, group: "particles", marker: "的 地 得", title: "The three de: 的, 地, 得",
    en: "All three are said de, and each attaches to something different. 的 comes before a noun (我的书, 好看的电影). 地 comes before a verb and turns a description into an adverb (慢慢地走). 得 comes after a verb and introduces a judgement of it (走得很慢).",
    de: "Alle drei klingen wie de, hängen aber an Unterschiedlichem. 的 steht vor einem Nomen (我的书, 好看的电影). 地 steht vor einem Verb und macht aus einer Beschreibung ein Adverb (慢慢地走). 得 steht nach dem Verb und leitet dessen Bewertung ein (走得很慢).",
    examples: [
      ["我的书", "wǒ de shū", "my book (的 + noun)"],
      ["他慢慢地说。", "Tā mànmàn de shuō.", "He speaks slowly (地 + verb)."],
      ["他说得很慢。", "Tā shuō de hěn màn.", "He speaks slowly (得 after the verb)."]
    ],
    check: { q: "Which particle fits: 他高兴___笑了?", options: ["的", "地", "得", "了"], answer: 1,
      note: "It describes how he laughed and stands before the verb, so it is 地." }
  },
  {
    id: "r-ba", level: 3, group: "verbs", marker: "把", title: "把 — do something to a known object",
    en: "把 moves the object in front of the verb to say what happened to it: 我把门关上了. Three conditions must hold: the object is something both sides already know about, the verb is an action that changes it, and the verb carries something after it — a result, 了, or a direction. A bare verb is not enough.",
    de: "把 zieht das Objekt vor das Verb, um zu sagen, was damit passiert ist: 我把门关上了. Drei Bedingungen: Das Objekt ist beiden bekannt, das Verb verändert es, und nach dem Verb steht etwas — ein Resultat, 了 oder eine Richtung. Ein nacktes Verb genügt nicht.",
    examples: [
      ["我把门关上了。", "Wǒ bǎ mén guān shàng le.", "I closed the door."],
      ["请把书放在桌子上。", "Qǐng bǎ shū fàng zài zhuōzi shàng.", "Please put the book on the table."],
      ["他把钱包丢了。", "Tā bǎ qiánbāo diū le.", "He lost his wallet."]
    ],
    check: { q: "Which 把 sentence is complete?", options: ["我把书看。", "我把书看完了。", "我把一本书。", "把我书看了。"], answer: 1,
      note: "The verb needs a result — 看完了, not just 看." }
  },
  {
    id: "r-bei", level: 3, group: "verbs", marker: "被", title: "被 — the passive, and when to skip it",
    en: "被 names who did it: 蛋糕被他吃完了. It traditionally carries a whiff of something unwelcome. Chinese often prefers no marker at all — 菜做好了 (the food is ready) is a passive idea with an active shape, and that is the more common everyday choice.",
    de: "被 nennt den Verursacher: 蛋糕被他吃完了. Traditionell schwingt etwas Unerwünschtes mit. Oft steht gar kein Marker — 菜做好了 (das Essen ist fertig) ist passiv gemeint, aber aktiv gebaut, und das ist im Alltag häufiger.",
    examples: [
      ["蛋糕被他吃完了。", "Dàngāo bèi tā chī wán le.", "The cake was eaten by him."],
      ["我的手机被偷了。", "Wǒ de shǒujī bèi tōu le.", "My phone was stolen."],
      ["菜做好了。", "Cài zuò hǎo le.", "The food is ready."]
    ],
    check: { q: "Which sentence uses 被 correctly?", options: ["我被吃饭了。", "杯子被他打破了。", "他被走了。", "被杯子打破他了。"], answer: 1,
      note: "被 needs an affected subject first, then the doer, then a verb with a result." }
  },
  {
    id: "r-result", level: 3, group: "verbs", marker: "完 好 懂 到", title: "Result complements",
    en: "A second verb or adjective glued to the first tells you how the action ended: 看完 (finished reading), 听懂 (heard and understood), 找到 (found), 做好 (done properly), 写错 (written wrongly). Chinese splits doing from succeeding, so 我找了 only says you looked.",
    de: "Ein zweites Verb oder Adjektiv direkt am ersten sagt, wie die Handlung ausging: 看完 (fertig gelesen), 听懂 (verstanden), 找到 (gefunden), 做好 (fertig gemacht), 写错 (falsch geschrieben). Chinesisch trennt Versuchen und Gelingen — 我找了 heißt nur, dass man gesucht hat.",
    examples: [
      ["我看完了。", "Wǒ kàn wán le.", "I've finished reading it."],
      ["我听懂了。", "Wǒ tīng dǒng le.", "I understood it."],
      ["我没找到。", "Wǒ méi zhǎo dào.", "I didn't find it."]
    ],
    check: { q: "You searched but did not find it. Which is right?", options: ["我没找。", "我找了，但是没找到。", "我不找到。", "我没找到了。"], answer: 1,
      note: "找 is the attempt, 找到 is the success." }
  },
  {
    id: "r-potential", level: 3, group: "verbs", marker: "得 / 不", title: "Can you manage it? 看得懂 / 听不懂",
    en: "Slide 得 or 不 between verb and result to ask whether it can be pulled off: 看得懂 (can understand when reading), 听不懂 (can't make it out), 买不起 (can't afford). This is the natural way to say 'can', not 能 + result.",
    de: "Zwischen Verb und Resultat schiebt man 得 oder 不 ein, um Machbarkeit auszudrücken: 看得懂 (kann es lesend verstehen), 听不懂 (versteht es nicht), 买不起 (kann es sich nicht leisten). Das ist das natürliche „können“, nicht 能 + Resultat.",
    examples: [
      ["我听不懂。", "Wǒ tīng bu dǒng.", "I can't understand it (by ear)."],
      ["这本书我看得懂。", "Zhè běn shū wǒ kàn de dǒng.", "I can understand this book."],
      ["太贵了，我买不起。", "Tài guì le, wǒ mǎi bu qǐ.", "It's too expensive, I can't afford it."]
    ],
    check: { q: "How do you say 'I can't hear it clearly'?", options: ["我不能听清楚。", "我听不清楚。", "我没听清楚得。", "我听得不清楚。"], answer: 1,
      note: "The negative potential is verb + 不 + result." }
  },
  {
    id: "r-directional", level: 3, group: "verbs", marker: "上来 出去", title: "Directional endings",
    en: "来 and 去 tacked onto a verb tell you whether the movement comes towards the speaker or leads away: 进来 (come in), 出去 (go out), 拿回来 (bring back). 起来 also has a figurative use: 看起来 (looks like), 想起来 (recall).",
    de: "来 und 去 am Verb zeigen, ob die Bewegung zum Sprecher hin oder von ihm weg geht: 进来 (hereinkommen), 出去 (hinausgehen), 拿回来 (zurückbringen). 起来 hat auch eine übertragene Bedeutung: 看起来 (aussehen wie), 想起来 (sich erinnern).",
    examples: [
      ["请进来。", "Qǐng jìn lái.", "Come in, please."],
      ["他出去了。", "Tā chū qù le.", "He has gone out."],
      ["看起来不错。", "Kàn qǐlái búcuò.", "It looks pretty good."]
    ]
  },
  {
    id: "r-shide", level: 3, group: "verbs", marker: "是…的", title: "是…的 — the details of a past event",
    en: "When both sides already know something happened and the question is when, where or how, the frame is 是 … 的: 我是坐飞机来的. Compare 我来了 (it happened) with 我是昨天来的 (it happened yesterday).",
    de: "Wenn beide wissen, dass etwas passiert ist, und es um wann, wo oder wie geht, nimmt man 是 … 的: 我是坐飞机来的. Vergleiche 我来了 (es ist passiert) mit 我是昨天来的 (es war gestern).",
    examples: [
      ["我是昨天来的。", "Wǒ shì zuótiān lái de.", "It was yesterday that I came."],
      ["你是在哪儿学的汉语？", "Nǐ shì zài nǎr xué de Hànyǔ?", "Where did you learn Chinese?"],
      ["他是坐火车来的。", "Tā shì zuò huǒchē lái de.", "He came by train."]
    ],
    check: { q: "Someone asks how you got here. Which answer fits?", options: ["我坐地铁来了。", "我是坐地铁来的。", "我来了地铁。", "我是来地铁的。"], answer: 1,
      note: "是…的 highlights the manner of a known past event." }
  },
  {
    id: "r-jiu-cai", level: 3, group: "connect", marker: "就 / 才", title: "就 versus 才",
    en: "就 says it happened sooner, faster or more easily than expected: 他六点就来了. 才 says it took longer or more effort than expected: 他九点才来. Same clock, opposite attitude. Note that 才 sentences do not take 了.",
    de: "就 heißt: früher, schneller, leichter als erwartet — 他六点就来了. 才 heißt: später, mühsamer als erwartet — 他九点才来. Gleiche Uhrzeit, gegenteilige Haltung. In 才-Sätzen steht kein 了.",
    examples: [
      ["他六点就来了。", "Tā liù diǎn jiù lái le.", "He came as early as six."],
      ["他九点才来。", "Tā jiǔ diǎn cái lái.", "He didn't come until nine."],
      ["学了三年才学会。", "Xué le sān nián cái xuéhuì.", "It took three years of study to learn it."]
    ],
    check: { q: "Which sentence complains that he was late?", options: ["他八点就到了。", "他八点才到。", "他八点到了就。", "他就八点到了。"], answer: 1,
      note: "才 signals later than expected — and takes no 了." }
  },
  {
    id: "r-pairs", level: 3, group: "connect", marker: "虽然…但是", title: "Connectors come in pairs",
    en: "Unlike English, Chinese keeps both halves of a connector pair: 虽然…但是, 因为…所以, 不但…而且, 如果…就, 只有…才. Leaving out the second half sounds unfinished.",
    de: "Anders als im Deutschen bleiben beide Hälften eines Konnektorenpaars stehen: 虽然…但是, 因为…所以, 不但…而且, 如果…就, 只有…才. Fehlt die zweite Hälfte, klingt der Satz unfertig.",
    examples: [
      ["虽然很累，但是很高兴。", "Suīrán hěn lèi, dànshì hěn gāoxìng.", "Although tired, I'm happy."],
      ["如果下雨，我就不去。", "Rúguǒ xià yǔ, wǒ jiù bú qù.", "If it rains, I won't go."],
      ["只有努力才能成功。", "Zhǐyǒu nǔlì cái néng chénggōng.", "Only through effort can you succeed."]
    ],
    check: { q: "Complete: 虽然他很忙，___他还是来了。", options: ["所以", "但是", "因为", "就"], answer: 1,
      note: "虽然 always pairs with 但是 or 可是." }
  },
  {
    id: "r-yuelaiyue", level: 3, group: "connect", marker: "越来越", title: "越来越 and 越…越",
    en: "越来越 + adjective means more and more over time: 天气越来越冷. 越 A 越 B links two changes: 越多越好 (the more the better), 越吃越想吃.",
    de: "越来越 + Adjektiv heißt „immer mehr“ mit der Zeit: 天气越来越冷. 越 A 越 B verbindet zwei Entwicklungen: 越多越好 (je mehr, desto besser), 越吃越想吃.",
    examples: [
      ["天气越来越冷了。", "Tiānqì yuè lái yuè lěng le.", "The weather is getting colder and colder."],
      ["越多越好。", "Yuè duō yuè hǎo.", "The more the better."]
    ],
    check: { q: "Which means 'his Chinese is getting better and better'?", options: ["他的汉语很越好。", "他的汉语越来越好。", "他的汉语越好越来。", "他的汉语来越好。"], answer: 1,
      note: "越来越 + adjective describes a gradual change." }
  },
  {
    id: "r-duo-question", level: 3, group: "order", marker: "多", title: "Asking about size and length",
    en: "多 + adjective asks about a degree: 多大 (how old), 多长时间 (how long), 多远 (how far), 多高 (how tall). The answer replaces the 多, so the word order stays the same.",
    de: "多 + Adjektiv fragt nach dem Grad: 多大 (wie alt), 多长时间 (wie lange), 多远 (wie weit), 多高 (wie groß). Die Antwort ersetzt einfach 多, die Wortstellung bleibt gleich.",
    examples: [
      ["你多大？", "Nǐ duō dà?", "How old are you?"],
      ["要多长时间？", "Yào duō cháng shíjiān?", "How long does it take?"],
      ["离这儿多远？", "Lí zhèr duō yuǎn?", "How far is it from here?"]
    ]
  },

  /* ---------------- HSK 4 ---------------- */
  {
    id: "r-chule4", level: 4, group: "connect", marker: "除了…以外", title: "除了 — the adverb decides the meaning",
    en: "除了 A 以外 can exclude or include, and only the second clause tells you which. With 都 it means 'except A'. With 还 or 也 it means 'besides A, additionally'. 以外 itself is often dropped in speech.",
    de: "除了 A 以外 kann ausschließen oder einschließen — erst der zweite Teil verrät, was gemeint ist. Mit 都 heißt es „außer A“, mit 还 oder 也 „außer A auch noch“. 以外 fällt umgangssprachlich oft weg.",
    examples: [
      ["除了他以外，大家都来了。", "Chúle tā yǐwài, dàjiā dōu lái le.", "Everyone came except him."],
      ["除了汉语，他还会法语。", "Chúle Hànyǔ, tā hái huì Fǎyǔ.", "Besides Chinese, he also speaks French."]
    ],
    check: { q: "除了小王，我们都同意。 Does Xiao Wang agree?", options: ["Yes", "No", "It doesn't say", "Only Xiao Wang agrees"], answer: 1,
      note: "都 in the second clause means Xiao Wang is excluded." }
  },
  {
    id: "r-concession4", level: 4, group: "connect", marker: "虽然 / 即使 / 尽管", title: "Three ways to concede",
    en: "虽然 concedes a fact that is true. 即使 concedes a hypothetical that may never happen, and needs 也. 尽管 is the written cousin of 虽然, and pairs with 但是 or 还是.",
    de: "虽然 räumt eine Tatsache ein. 即使 räumt einen hypothetischen Fall ein und braucht 也. 尽管 ist die schriftsprachliche Variante von 虽然 und steht mit 但是 oder 还是.",
    examples: [
      ["虽然下雨，但是我去了。", "Suīrán xià yǔ, dànshì wǒ qù le.", "Although it rained, I went."],
      ["即使下雨，我也去。", "Jíshǐ xià yǔ, wǒ yě qù.", "Even if it rains, I'll go."],
      ["尽管很累，他还是坚持了。", "Jǐnguǎn hěn lèi, tā háishì jiānchí le.", "Although exhausted, he kept going."]
    ],
    check: { q: "It has not rained yet, but you would still go. Which fits?", options: ["虽然下雨，我去。", "即使下雨，我也去。", "尽管下雨，我去了。", "因为下雨，我去。"], answer: 1,
      note: "即使 handles the hypothetical case and takes 也." }
  },
  {
    id: "r-wulun4", level: 4, group: "connect", marker: "无论 / 不管", title: "无论 and 不管 need something open",
    en: "Both mean 'no matter', but what follows must be genuinely open: a question word (多难, 谁), an A-not-A (去不去), or 还是. A plain statement after them is wrong. The second clause takes 都 or 也.",
    de: "Beide heißen „egal“, aber danach muss etwas Offenes stehen: ein Fragewort (多难, 谁), ein A-nicht-A (去不去) oder 还是. Eine bloße Aussage danach ist falsch. Der zweite Teil nimmt 都 oder 也.",
    examples: [
      ["不管你去不去，我都去。", "Bùguǎn nǐ qù bu qù, wǒ dōu qù.", "Whether you go or not, I'm going."],
      ["无论谁问，都别说。", "Wúlùn shéi wèn, dōu bié shuō.", "No matter who asks, don't tell them."]
    ],
    check: { q: "Which sentence is grammatical?", options: ["不管很贵，我都买。", "不管多贵，我都买。", "不管贵，我买。", "不管都贵，我买。"], answer: 1,
      note: "多贵 is open; 很贵 is a fixed statement and cannot follow 不管." }
  },
  {
    id: "r-register4", level: 4, group: "connect", marker: "由于 / 因此", title: "Spoken and written registers",
    en: "HSK 4 introduces written twins of familiar spoken words: 因为→由于, 所以→因此, 但是→然而, 和→与, 非常→十分. In an exam or a report, the written form fits; in conversation it sounds stiff.",
    de: "HSK 4 bringt schriftsprachliche Zwillinge bekannter Wörter: 因为→由于, 所以→因此, 但是→然而, 和→与, 非常→十分. In Prüfung oder Bericht passt die Schriftform; im Gespräch klingt sie steif.",
    examples: [
      ["由于天气不好，比赛取消了。", "Yóuyú tiānqì bù hǎo, bǐsài qǔxiāo le.", "Due to bad weather the match was cancelled."],
      ["计划很好，然而没有成功。", "Jìhuà hěn hǎo, rán'ér méiyǒu chénggōng.", "The plan was good, however it failed."]
    ],
    check: { q: "Which is the written equivalent of 所以?", options: ["因为", "因此", "还是", "不过"], answer: 1,
      note: "由于 … 因此 is the formal counterpart of 因为 … 所以." }
  },
  {
    id: "r-causative4", level: 4, group: "verbs", marker: "让 / 使 / 叫", title: "让, 使 and 叫 — making things happen",
    en: "让 is the everyday causative: 老板让我加班. 使 is written and mostly takes feelings or abstract results: 使人感动. 叫 is spoken and slightly more forceful. All three need the person and the resulting state.",
    de: "让 ist das alltägliche Kausativ: 老板让我加班. 使 ist schriftsprachlich und steht meist bei Gefühlen oder abstrakten Folgen: 使人感动. 叫 ist mündlich und etwas direkter. Alle drei brauchen Person und Folge.",
    examples: [
      ["老板让我加班。", "Lǎobǎn ràng wǒ jiābān.", "The boss made me work overtime."],
      ["这个故事使人感动。", "Zhège gùshi shǐ rén gǎndòng.", "This story is moving."],
      ["妈妈叫我回家。", "Māma jiào wǒ huí jiā.", "Mum told me to come home."]
    ],
    check: { q: "Which sentence is complete?", options: ["这个消息让我。", "这个消息让我很吃惊。", "这个消息使很吃惊。", "这个消息让吃惊我。"], answer: 1,
      note: "The causative needs both the person and what happens to them." }
  },
  {
    id: "r-zhe4", level: 4, group: "verbs", marker: "着 vs 在", title: "着 is a state, 在 is an action",
    en: "在 + verb reports what someone is doing right now: 他在开门. Verb + 着 reports the state that resulted and still holds: 门开着. 着 also carries a background action while the main verb follows: 他站着看书.",
    de: "在 + Verb sagt, was jemand gerade tut: 他在开门. Verb + 着 sagt, welcher Zustand daraus bleibt: 门开着. 着 trägt außerdem eine Nebenhandlung, das Hauptverb folgt: 他站着看书.",
    examples: [
      ["他在打电话。", "Tā zài dǎ diànhuà.", "He is on the phone right now."],
      ["窗户开着。", "Chuānghu kāi zhe.", "The window is open."],
      ["她笑着说。", "Tā xiào zhe shuō.", "She said with a smile."]
    ],
    check: { q: "Which describes a light that is currently on?", options: ["灯在开。", "灯开着。", "灯开了在。", "灯着开。"], answer: 1,
      note: "着 marks the lasting state, not the act of switching on." }
  },
  {
    id: "r-anydou4", level: 4, group: "particles", marker: "谁都 / 什么都", title: "Question word + 都 = any / every",
    en: "A question word stops asking when 都 or 也 follows it: 谁都可以 (anyone can), 什么都行 (anything goes), 哪儿都不去 (going nowhere). With a negation the meaning flips to 'none at all'.",
    de: "Ein Fragewort fragt nicht mehr, sobald 都 oder 也 folgt: 谁都可以 (jeder kann), 什么都行 (alles geht), 哪儿都不去 (nirgendwohin). Mit Verneinung wird daraus „gar nichts“.",
    examples: [
      ["谁都知道这件事。", "Shéi dōu zhīdào zhè jiàn shì.", "Everyone knows about this."],
      ["我什么都不想吃。", "Wǒ shénme dōu bù xiǎng chī.", "I don't feel like eating anything."]
    ],
    check: { q: "How do you say 'he goes nowhere'?", options: ["他不去哪儿。", "他哪儿都不去。", "他都哪儿不去。", "他哪儿不都去。"], answer: 1,
      note: "Question word first, then 都, then the negation." }
  },
  {
    id: "r-topic4", level: 4, group: "order", marker: "对 / 关于", title: "对, 关于, 对于 — naming the topic",
    en: "对 + topic + predicate says how someone relates to something: 我对这个感兴趣. 关于 introduces the subject matter of a thing: 关于中国的书. 对于 is the more formal version of 对 and usually opens the sentence.",
    de: "对 + Thema + Aussage sagt, wie jemand dazu steht: 我对这个感兴趣. 关于 nennt das Thema einer Sache: 关于中国的书. 对于 ist die förmlichere Variante von 对 und steht meist am Satzanfang.",
    examples: [
      ["我对历史很感兴趣。", "Wǒ duì lìshǐ hěn gǎn xìngqù.", "I'm very interested in history."],
      ["这是一本关于经济的书。", "Zhè shì yì běn guānyú jīngjì de shū.", "This is a book about economics."],
      ["对于这个问题，我没有意见。", "Duìyú zhège wèntí, wǒ méiyǒu yìjiàn.", "As for this question, I have no opinion."]
    ],
    check: { q: "Which fits: 我___这个工作很满意。", options: ["关于", "对", "跟", "把"], answer: 1,
      note: "对 links a person to their attitude towards something." }
  },
  {
    id: "r-chadian4", level: 4, group: "verbs", marker: "差点儿", title: "差点儿 — the near miss",
    en: "差点儿 means it almost happened. If the event was unwanted, the positive and the negative mean the same thing and both are a relief: 差点儿迟到 and 差点儿没迟到 both mean you made it. If the event was wanted, the negation matters: 差点儿没买到 means you only just got it.",
    de: "差点儿 heißt „beinahe“. War das Ereignis unerwünscht, bedeuten positive und negative Form dasselbe: 差点儿迟到 und 差点儿没迟到 heißen beide, dass du es geschafft hast. War es erwünscht, zählt die Verneinung: 差点儿没买到 heißt, du hast es gerade noch bekommen.",
    examples: [
      ["我差点儿迟到了。", "Wǒ chàdiǎnr chídào le.", "I was almost late (but wasn't)."],
      ["他差点儿没赶上火车。", "Tā chàdiǎnr méi gǎn shàng huǒchē.", "He only just caught the train."]
    ],
    check: { q: "我差点儿摔倒了。 Did the person fall?", options: ["Yes", "No", "Twice", "It doesn't say"], answer: 1,
      note: "差点儿 + unwanted event = it did not happen." }
  },
  {
    id: "r-passive4", level: 4, group: "verbs", marker: "菜做好了", title: "The passive without a marker",
    en: "Chinese frequently expresses a passive idea with plain active shape when the doer is obvious or irrelevant: 饭做好了, 问题解决了, 房间打扫干净了. Using 被 there would sound heavy and slightly negative.",
    de: "Chinesisch drückt Passivisches oft ohne Marker aus, wenn der Verursacher klar oder egal ist: 饭做好了, 问题解决了, 房间打扫干净了. Ein 被 klänge dort schwerfällig und leicht negativ.",
    examples: [
      ["问题解决了。", "Wèntí jiějué le.", "The problem has been solved."],
      ["房间打扫干净了。", "Fángjiān dǎsǎo gānjìng le.", "The room has been cleaned."]
    ],
    check: { q: "Which is the natural way to say 'dinner is ready'?", options: ["饭被做好了。", "饭做好了。", "被饭做好了。", "饭做了好。"], answer: 1,
      note: "No marker is needed when the doer is obvious." }
  },
  {
    id: "r-suizhe4", level: 4, group: "connect", marker: "随着", title: "随着 — as one thing changes",
    en: "随着 + a change, then the consequence: 随着经济的发展，生活越来越好. It is written style, and the part after 随着 must be a process or a change, not a single point in time.",
    de: "随着 + Veränderung, dann die Folge: 随着经济的发展，生活越来越好. Schriftsprachlich, und nach 随着 muss ein Prozess oder eine Entwicklung stehen, kein einzelner Zeitpunkt.",
    examples: [
      ["随着时间过去，他好多了。", "Suízhe shíjiān guòqù, tā hǎo duō le.", "As time passed, he got much better."],
      ["随着技术的发展，工作变了。", "Suízhe jìshù de fāzhǎn, gōngzuò biàn le.", "As technology developed, the work changed."]
    ]
  },
  {
    id: "r-mw4", level: 4, group: "particles", marker: "份 篇 台 座", title: "Measure words get specific",
    en: "At this level 个 stops being enough: 一份报告 (a copy of a report), 一篇文章 (an article), 一台电脑 (a machine), 一座桥 (a structure), 一场比赛 (an event), 一位老师 (a person, politely).",
    de: "Auf diesem Niveau reicht 个 nicht mehr: 一份报告 (ein Exemplar), 一篇文章 (ein Artikel), 一台电脑 (ein Gerät), 一座桥 (ein Bauwerk), 一场比赛 (ein Ereignis), 一位老师 (höflich für Personen).",
    examples: [
      ["我写了一篇文章。", "Wǒ xiě le yì piān wénzhāng.", "I wrote an article."],
      ["办公室有三台电脑。", "Bàngōngshì yǒu sān tái diànnǎo.", "There are three computers in the office."]
    ],
    check: { q: "Which measure word goes with 比赛?", options: ["一台比赛", "一场比赛", "一篇比赛", "一座比赛"], answer: 1,
      note: "场 is for events that take place over a period." }
  }
];

/* Gap-fill bank. ___ marks the blank; options are single words. */
export const CLOZE = [
  /* HSK 1 */
  { id: "c1-01", level: 1, text: "我___学生。", options: ["是", "很", "有", "在"], answer: 0, pinyin: "Wǒ shì xuéshēng.", en: "I am a student.", why: "是 links two nouns.", tag: "是" },
  { id: "c1-02", level: 1, text: "今天天气___好。", options: ["是", "很", "在", "的"], answer: 1, pinyin: "Jīntiān tiānqì hěn hǎo.", en: "The weather is nice today.", why: "Adjectives take 很, not 是.", tag: "很" },
  { id: "c1-03", level: 1, text: "你是老师___？", options: ["呢", "吧", "吗", "了"], answer: 2, pinyin: "Nǐ shì lǎoshī ma?", en: "Are you a teacher?", why: "吗 turns a statement into a yes/no question.", tag: "吗" },
  { id: "c1-04", level: 1, text: "这是我___书。", options: ["得", "地", "的", "了"], answer: 2, pinyin: "Zhè shì wǒ de shū.", en: "This is my book.", why: "的 before a noun marks possession.", tag: "的" },
  { id: "c1-05", level: 1, text: "我有两___朋友。", options: ["个", "本", "很", "的"], answer: 0, pinyin: "Wǒ yǒu liǎng ge péngyou.", en: "I have two friends.", why: "Number + measure word + noun; 个 is the general one.", tag: "量词" },
  { id: "c1-06", level: 1, text: "我___在家。", options: ["没", "不", "很", "了"], answer: 1, pinyin: "Wǒ bú zài jiā.", en: "I'm not at home.", why: "不 negates a present state.", tag: "不" },
  { id: "c1-07", level: 1, text: "他___学校。", options: ["在", "是", "有", "很"], answer: 0, pinyin: "Tā zài xuéxiào.", en: "He is at school.", why: "在 + place says where someone is.", tag: "在" },
  { id: "c1-08", level: 1, text: "我___有时间。", options: ["不", "没", "很", "太"], answer: 1, pinyin: "Wǒ méiyǒu shíjiān.", en: "I don't have time.", why: "有 is always negated with 没.", tag: "没有" },
  { id: "c1-09", level: 1, text: "你叫___名字？", options: ["谁", "什么", "哪儿", "怎么"], answer: 1, pinyin: "Nǐ jiào shénme míngzi?", en: "What is your name?", why: "什么 stands where the answer would go.", tag: "疑问词" },
  { id: "c1-10", level: 1, text: "我明天___北京。", options: ["去", "在", "的", "是"], answer: 0, pinyin: "Wǒ míngtiān qù Běijīng.", en: "I'm going to Beijing tomorrow.", why: "Time comes before the verb, then verb and object.", tag: "语序" },
  { id: "c1-11", level: 1, text: "请给我一___水。", options: ["个", "杯", "本", "件"], answer: 1, pinyin: "Qǐng gěi wǒ yì bēi shuǐ.", en: "Please give me a glass of water.", why: "杯 is the measure word for cups and glasses.", tag: "量词" },
  { id: "c1-12", level: 1, text: "他___去吗？", options: ["也", "都", "很", "的"], answer: 0, pinyin: "Tā yě qù ma?", en: "Is he going too?", why: "也 sits after the subject and before the verb.", tag: "也" },

  /* HSK 2 */
  { id: "c2-01", level: 2, text: "我昨天买___一本书。", options: ["过", "了", "着", "的"], answer: 1, pinyin: "Wǒ zuótiān mǎi le yì běn shū.", en: "I bought a book yesterday.", why: "了 after the verb marks a completed action.", tag: "了" },
  { id: "c2-02", level: 2, text: "我去___中国。", options: ["了", "过", "着", "得"], answer: 1, pinyin: "Wǒ qù guo Zhōngguó.", en: "I have been to China.", why: "过 marks an experience without a fixed time.", tag: "过" },
  { id: "c2-03", level: 2, text: "他___我高。", options: ["很", "比", "跟", "都"], answer: 1, pinyin: "Tā bǐ wǒ gāo.", en: "He is taller than me.", why: "A 比 B + adjective, with no 很.", tag: "比" },
  { id: "c2-04", level: 2, text: "她说___很好。", options: ["的", "地", "得", "了"], answer: 2, pinyin: "Tā shuō de hěn hǎo.", en: "She speaks very well.", why: "得 after the verb introduces how well it is done.", tag: "得" },
  { id: "c2-05", level: 2, text: "我们___是学生。", options: ["也", "都", "还", "就"], answer: 1, pinyin: "Wǒmen dōu shì xuéshēng.", en: "We are all students.", why: "都 follows the group it sums up.", tag: "都" },
  { id: "c2-06", level: 2, text: "我家___学校很近。", options: ["从", "离", "到", "在"], answer: 1, pinyin: "Wǒ jiā lí xuéxiào hěn jìn.", en: "My home is close to school.", why: "离 measures distance and pairs with 远/近.", tag: "离" },
  { id: "c2-07", level: 2, text: "这个菜___贵了。", options: ["很", "太", "非常", "比"], answer: 1, pinyin: "Zhège cài tài guì le.", en: "This dish is too expensive.", why: "太 … 了 is a fixed pair for excess.", tag: "太…了" },
  { id: "c2-08", level: 2, text: "我学了两个___。", options: ["小时", "点", "月份", "时候"], answer: 0, pinyin: "Wǒ xué le liǎng ge xiǎoshí.", en: "I studied for two hours.", why: "Duration follows the verb; 小时 is the unit of hours.", tag: "时量" },
  { id: "c2-09", level: 2, text: "这个有点儿___。", options: ["贵", "很贵", "太贵", "贵了"], answer: 0, pinyin: "Zhège yǒudiǎnr guì.", en: "This is a bit expensive.", why: "有点儿 stands directly before a plain adjective.", tag: "有点儿" },
  { id: "c2-10", level: 2, text: "他___在打电话。", options: ["正", "了", "过", "得"], answer: 0, pinyin: "Tā zhèng zài dǎ diànhuà.", en: "He is on the phone right now.", why: "正在 + verb marks an action in progress.", tag: "正在" },
  { id: "c2-11", level: 2, text: "___下雨，所以我没去。", options: ["虽然", "因为", "如果", "但是"], answer: 1, pinyin: "Yīnwèi xià yǔ, suǒyǐ wǒ méi qù.", en: "Because it rained, I didn't go.", why: "因为 pairs with 所以.", tag: "因为…所以" },
  { id: "c2-12", level: 2, text: "我们一起去___。", options: ["吗", "吧", "呢", "了"], answer: 1, pinyin: "Wǒmen yìqǐ qù ba.", en: "Let's go together.", why: "吧 turns a statement into a suggestion.", tag: "吧" },

  /* HSK 3 */
  { id: "c3-01", level: 3, text: "请___门关上。", options: ["被", "把", "从", "给"], answer: 1, pinyin: "Qǐng bǎ mén guān shàng.", en: "Please close the door.", why: "把 + object + verb + result.", tag: "把" },
  { id: "c3-02", level: 3, text: "蛋糕___他吃完了。", options: ["把", "被", "让", "给"], answer: 1, pinyin: "Dàngāo bèi tā chī wán le.", en: "The cake was eaten by him.", why: "被 names who did it to the affected subject.", tag: "被" },
  { id: "c3-03", level: 3, text: "他慢慢___走过来。", options: ["的", "地", "得", "了"], answer: 1, pinyin: "Tā mànmàn de zǒu guòlái.", en: "He walked over slowly.", why: "地 turns a description into an adverb before the verb.", tag: "地" },
  { id: "c3-04", level: 3, text: "这本书我看___懂。", options: ["不", "得", "了", "着"], answer: 1, pinyin: "Zhè běn shū wǒ kàn de dǒng.", en: "I can understand this book.", why: "得 between verb and result marks ability.", tag: "可能补语" },
  { id: "c3-05", level: 3, text: "我___昨天来的。", options: ["在", "是", "会", "把"], answer: 1, pinyin: "Wǒ shì zuótiān lái de.", en: "It was yesterday that I came.", why: "是 … 的 highlights details of a known past event.", tag: "是…的" },
  { id: "c3-06", level: 3, text: "他九点___来。", options: ["就", "才", "都", "还"], answer: 1, pinyin: "Tā jiǔ diǎn cái lái.", en: "He didn't come until nine.", why: "才 means later than expected, and takes no 了.", tag: "才" },
  { id: "c3-07", level: 3, text: "___下雨，我就不去。", options: ["虽然", "如果", "因为", "除了"], answer: 1, pinyin: "Rúguǒ xià yǔ, wǒ jiù bú qù.", en: "If it rains, I won't go.", why: "如果 pairs with 就.", tag: "如果…就" },
  { id: "c3-08", level: 3, text: "我找了很久，可是没找___。", options: ["完", "到", "好", "懂"], answer: 1, pinyin: "Wǒ zhǎo le hěn jiǔ, kěshì méi zhǎo dào.", en: "I looked for a long time but didn't find it.", why: "到 is the result complement for successfully finding something.", tag: "结果补语" },
  { id: "c3-09", level: 3, text: "天气___来越冷了。", options: ["更", "越", "还", "太"], answer: 1, pinyin: "Tiānqì yuè lái yuè lěng le.", en: "The weather is getting colder and colder.", why: "越来越 + adjective describes a gradual change.", tag: "越来越" },
  { id: "c3-10", level: 3, text: "___他以外，大家都来了。", options: ["除了", "关于", "对于", "虽然"], answer: 0, pinyin: "Chúle tā yǐwài, dàjiā dōu lái le.", en: "Everyone came except him.", why: "除了 … 都 excludes the person named.", tag: "除了" },
  { id: "c3-11", level: 3, text: "他一边走一边___手机。", options: ["看", "看着", "在看", "看了"], answer: 0, pinyin: "Tā yìbiān zǒu yìbiān kàn shǒujī.", en: "He looks at his phone while walking.", why: "一边 … 一边 takes a plain verb in each half.", tag: "一边…一边" },
  { id: "c3-12", level: 3, text: "要___长时间？", options: ["很", "多", "太", "几"], answer: 1, pinyin: "Yào duō cháng shíjiān?", en: "How long does it take?", why: "多 + adjective asks about a degree.", tag: "多" },

  /* HSK 4 */
  { id: "c4-01", level: 4, text: "___下雨，我也要去。", options: ["虽然", "即使", "因为", "由于"], answer: 1, pinyin: "Jíshǐ xià yǔ, wǒ yě yào qù.", en: "Even if it rains, I'll still go.", why: "即使 handles a hypothetical case and pairs with 也.", tag: "即使…也" },
  { id: "c4-02", level: 4, text: "不管多难，我___要试。", options: ["就", "都", "才", "也"], answer: 1, pinyin: "Bùguǎn duō nán, wǒ dōu yào shì.", en: "No matter how hard, I'll try.", why: "不管 needs 都 or 也 in the second clause.", tag: "不管…都" },
  { id: "c4-03", level: 4, text: "这个消息___我很吃惊。", options: ["把", "被", "让", "给"], answer: 2, pinyin: "Zhège xiāoxi ràng wǒ hěn chījīng.", en: "This news surprised me.", why: "让 + person + resulting state.", tag: "让" },
  { id: "c4-04", level: 4, text: "门开___，风很大。", options: ["了", "着", "过", "得"], answer: 1, pinyin: "Mén kāi zhe, fēng hěn dà.", en: "The door is open and it's windy.", why: "着 marks a lasting state, not the act itself.", tag: "着" },
  { id: "c4-05", level: 4, text: "我___这个工作很感兴趣。", options: ["把", "对", "被", "跟"], answer: 1, pinyin: "Wǒ duì zhège gōngzuò hěn gǎn xìngqù.", en: "I'm very interested in this job.", why: "对 + topic + attitude.", tag: "对" },
  { id: "c4-06", level: 4, text: "___天气不好，比赛取消了。", options: ["由于", "关于", "对于", "随着"], answer: 0, pinyin: "Yóuyú tiānqì bù hǎo, bǐsài qǔxiāo le.", en: "Due to bad weather, the match was cancelled.", why: "由于 opens a written-style reason.", tag: "由于" },
  { id: "c4-07", level: 4, text: "他___都不想说。", options: ["什么", "怎么", "哪个", "多少"], answer: 0, pinyin: "Tā shénme dōu bù xiǎng shuō.", en: "He doesn't want to say anything at all.", why: "Question word + 都 + negation means nothing at all.", tag: "什么都" },
  { id: "c4-08", level: 4, text: "我___儿迟到了。", options: ["差点", "有点", "一点", "快点"], answer: 0, pinyin: "Wǒ chàdiǎnr chídào le.", en: "I was almost late.", why: "差点儿 + unwanted event means it did not happen.", tag: "差点儿" },
  { id: "c4-09", level: 4, text: "___时间过去，情况好多了。", options: ["关于", "随着", "由于", "按照"], answer: 1, pinyin: "Suízhe shíjiān guòqù, qíngkuàng hǎo duō le.", en: "As time passed, things got much better.", why: "随着 introduces a process that drives the change.", tag: "随着" },
  { id: "c4-10", level: 4, text: "问题已经解决___。", options: ["着", "了", "过", "得"], answer: 1, pinyin: "Wèntí yǐjīng jiějué le.", en: "The problem has been solved.", why: "No 被 is needed when the doer is obvious.", tag: "意义被动" },
  { id: "c4-11", level: 4, text: "我写了一___文章。", options: ["台", "篇", "座", "份"], answer: 1, pinyin: "Wǒ xiě le yì piān wénzhāng.", en: "I wrote an article.", why: "篇 is the measure word for articles and essays.", tag: "量词" },
  { id: "c4-12", level: 4, text: "他不但会开车，___开得很好。", options: ["而且", "但是", "所以", "因为"], answer: 0, pinyin: "Tā búdàn huì kāichē, érqiě kāi de hěn hǎo.", en: "He can not only drive, he drives well.", why: "不但 pairs with 而且.", tag: "不但…而且" },
  { id: "c4-13", level: 4, text: "请___要求填写表格。", options: ["关于", "按照", "由于", "随着"], answer: 1, pinyin: "Qǐng ànzhào yāoqiú tiánxiě biǎogé.", en: "Please fill in the form as required.", why: "按照 + standard means in accordance with it.", tag: "按照" },
  { id: "c4-14", level: 4, text: "___你努力，就会成功。", options: ["只要", "只有", "除了", "无论"], answer: 0, pinyin: "Zhǐyào nǐ nǔlì, jiù huì chénggōng.", en: "As long as you work hard, you'll succeed.", why: "只要 pairs with 就 for a sufficient condition.", tag: "只要…就" }
];
