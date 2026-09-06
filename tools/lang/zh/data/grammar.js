/* Grammar points, sentence-building material and tone minimal pairs.
   All content is plain data — no UI code in here. */

export const GRAMMAR = [
  {
    id: "g1-shi", level: 1, marker: "是", pinyin: "shì", title: "是 — A is B",
    en: "是 links two nouns: A 是 B. Unlike English, you do not use 是 before adjectives — use 很 instead.",
    de: "是 verbindet zwei Nomen: A 是 B. Vor Adjektiven steht kein 是, sondern 很.",
    examples: [
      ["我是学生。", "Wǒ shì xuéshēng.", "I am a student."],
      ["他不是老师。", "Tā bú shì lǎoshī.", "He is not a teacher."]
    ],
    quiz: { q: "Which sentence is correct?", options: ["我是很忙。", "我很忙。", "我是忙。", "我忙是。"], answer: 1,
      note: "Adjectives take 很, not 是: 我很忙 = I am busy." }
  },
  {
    id: "g1-you", level: 1, marker: "有", pinyin: "yǒu", title: "有 — to have / there is",
    en: "有 means 'to have' or 'there is'. Its negation is always 没有, never 不有.",
    de: "有 heißt „haben“ oder „es gibt“. Die Verneinung ist immer 没有, nie 不有.",
    examples: [
      ["我有两个孩子。", "Wǒ yǒu liǎng ge háizi.", "I have two children."],
      ["桌子上没有书。", "Zhuōzi shàng méiyǒu shū.", "There are no books on the table."]
    ],
    quiz: { q: "How do you say 'I don't have money'?", options: ["我不有钱。", "我没有钱。", "我不是钱。", "我没钱有。"], answer: 1,
      note: "有 is negated with 没, so: 我没有钱。" }
  },
  {
    id: "g1-ma", level: 1, marker: "吗", pinyin: "ma", title: "吗 — yes/no questions",
    en: "Add 吗 to the end of a statement to turn it into a yes/no question. The word order does not change.",
    de: "吗 am Satzende macht aus einer Aussage eine Ja/Nein-Frage. Die Wortstellung bleibt gleich.",
    examples: [
      ["你是学生吗？", "Nǐ shì xuéshēng ma?", "Are you a student?"],
      ["你喜欢喝茶吗？", "Nǐ xǐhuan hē chá ma?", "Do you like drinking tea?"]
    ],
    quiz: { q: "Turn 你忙 into a question.", options: ["吗你忙？", "你吗忙？", "你忙吗？", "你忙不？"], answer: 2,
      note: "吗 always goes at the very end of the sentence." }
  },
  {
    id: "g1-de", level: 1, marker: "的", pinyin: "de", title: "的 — possession and description",
    en: "的 connects a modifier to a noun: 我的书 (my book). With close relationships it is often dropped: 我妈妈.",
    de: "的 verbindet Bestimmung und Nomen: 我的书. Bei engen Beziehungen entfällt es oft: 我妈妈.",
    examples: [
      ["这是我的手机。", "Zhè shì wǒ de shǒujī.", "This is my phone."],
      ["他是我哥哥。", "Tā shì wǒ gēge.", "He is my older brother."]
    ],
    quiz: { q: "Which means 'the teacher's book'?", options: ["书的老师", "老师的书", "老师书的", "的老师书"], answer: 1,
      note: "The owner comes first: 老师的书." }
  },
  {
    id: "g1-hen", level: 1, marker: "很", pinyin: "hěn", title: "很 — adjectives need a link",
    en: "Chinese adjectives work like verbs. A bare adjective sounds like a comparison, so 很 is added as a neutral link.",
    de: "Adjektive funktionieren wie Verben. Ohne 很 klingt der Satz wie ein Vergleich, deshalb steht 很 als neutrale Verbindung.",
    examples: [
      ["天气很好。", "Tiānqì hěn hǎo.", "The weather is nice."],
      ["这个菜很好吃。", "Zhège cài hěn hǎochī.", "This dish is delicious."]
    ],
    quiz: { q: "Which is the natural way to say 'She is pretty'?", options: ["她是漂亮。", "她很漂亮。", "她漂亮是。", "她的漂亮。"], answer: 1,
      note: "很 links subject and adjective; 是 is not used here." }
  },
  {
    id: "g1-zai", level: 1, marker: "在", pinyin: "zài", title: "在 — location",
    en: "在 marks where something is: Subject + 在 + place. It also appears before a verb to mark an action in progress.",
    de: "在 gibt den Ort an: Subjekt + 在 + Ort. Vor einem Verb markiert es eine laufende Handlung.",
    examples: [
      ["我在家。", "Wǒ zài jiā.", "I am at home."],
      ["他在看书。", "Tā zài kàn shū.", "He is reading."]
    ],
    quiz: { q: "Which sentence means 'I am at school'?", options: ["我学校在。", "我在学校。", "在我学校。", "学校我在。"], answer: 1,
      note: "Word order: subject + 在 + place." }
  },
  {
    id: "g1-le", level: 1, marker: "了", pinyin: "le", title: "了 — completed action",
    en: "了 after a verb signals that an action is completed. The negation drops 了 and uses 没: 我没吃饭.",
    de: "了 nach dem Verb zeigt eine abgeschlossene Handlung. Verneint fällt 了 weg und 没 tritt ein: 我没吃饭.",
    examples: [
      ["我吃了饭。", "Wǒ chī le fàn.", "I have eaten."],
      ["他没来。", "Tā méi lái.", "He didn't come."]
    ],
    quiz: { q: "Which is the correct negation of 我买了书?", options: ["我不买了书。", "我没买书。", "我没买了书。", "我买不了书。"], answer: 1,
      note: "了 disappears in the negative: 我没买书。" }
  },
  {
    id: "g1-ne", level: 1, marker: "呢", pinyin: "ne", title: "呢 — and you?",
    en: "呢 turns a topic into a short follow-up question: 我很好，你呢？ It also softens where-questions.",
    de: "呢 macht aus einem Thema eine kurze Rückfrage: 我很好，你呢？",
    examples: [
      ["我是德国人，你呢？", "Wǒ shì Déguó rén, nǐ ne?", "I'm German, and you?"],
      ["我的书呢？", "Wǒ de shū ne?", "Where is my book?"]
    ],
    quiz: { q: "You said you like tea. How do you ask the same back?", options: ["你吗？", "你呢？", "你了？", "你的？"], answer: 1,
      note: "呢 asks the same question back about a new topic." }
  },

  {
    id: "g2-bi", level: 2, marker: "比", pinyin: "bǐ", title: "比 — comparisons",
    en: "A 比 B + adjective. Do not add 很: 他比我高, not 他比我很高. Use 更 or 还 for 'even more'.",
    de: "A 比 B + Adjektiv. Kein 很: 他比我高. Für „noch mehr“ steht 更 oder 还.",
    examples: [
      ["他比我高。", "Tā bǐ wǒ gāo.", "He is taller than me."],
      ["今天比昨天更冷。", "Jīntiān bǐ zuótiān gèng lěng.", "Today is even colder than yesterday."]
    ],
    quiz: { q: "Which is correct?", options: ["她比我很忙。", "她比我忙。", "她很比我忙。", "她比忙我。"], answer: 1,
      note: "很 never appears in a 比 comparison." }
  },
  {
    id: "g2-guo", level: 2, marker: "过", pinyin: "guo", title: "过 — have done before",
    en: "过 after a verb marks a past experience: 我去过中国 (I have been to China at some point). Negation: 没…过.",
    de: "过 nach dem Verb markiert eine Erfahrung: 我去过中国. Verneinung: 没…过.",
    examples: [
      ["我吃过中国菜。", "Wǒ chī guo Zhōngguó cài.", "I have eaten Chinese food before."],
      ["他没去过北京。", "Tā méi qù guo Běijīng.", "He has never been to Beijing."]
    ],
    quiz: { q: "'I have never eaten it' is:", options: ["我不吃过。", "我没吃过。", "我吃过没。", "我没吃了。"], answer: 1,
      note: "Experience is negated with 没 + verb + 过." }
  },
  {
    id: "g2-zhengzai", level: 2, marker: "在…呢", pinyin: "zài … ne", title: "正在 — happening right now",
    en: "(正)在 + verb (+ 呢) marks an action in progress: 他正在打电话呢。",
    de: "(正)在 + Verb (+ 呢) markiert eine laufende Handlung: 他正在打电话呢。",
    examples: [
      ["我正在学习。", "Wǒ zhèngzài xuéxí.", "I'm studying right now."],
      ["他们在吃饭呢。", "Tāmen zài chī fàn ne.", "They are eating."]
    ],
    quiz: { q: "Which sentence says 'She is singing right now'?", options: ["她唱歌了。", "她在唱歌。", "她会唱歌。", "她唱过歌。"], answer: 1,
      note: "在 + verb = action in progress." }
  },
  {
    id: "g2-de-complement", level: 2, marker: "得", pinyin: "de", title: "得 — how well you do something",
    en: "Verb + 得 + adjective describes how an action is done: 他说得很好 (he speaks well).",
    de: "Verb + 得 + Adjektiv beschreibt, wie etwas getan wird: 他说得很好.",
    examples: [
      ["她跑得很快。", "Tā pǎo de hěn kuài.", "She runs fast."],
      ["你写得不错。", "Nǐ xiě de búcuò.", "You write quite well."]
    ],
    quiz: { q: "'He speaks Chinese well' is:", options: ["他说汉语很好。", "他汉语说得很好。", "他得说汉语好。", "他好说汉语得。"], answer: 1,
      note: "With an object, repeat the verb or front the object: 他汉语说得很好。" }
  },
  {
    id: "g2-yinwei", level: 2, marker: "因为…所以", pinyin: "yīnwèi … suǒyǐ", title: "因为…所以 — because / so",
    en: "Chinese keeps both halves of the pair: 因为 (because) … 所以 (therefore). Cause comes first.",
    de: "Beide Teile bleiben stehen: 因为 … 所以. Der Grund steht zuerst.",
    examples: [
      ["因为下雨，所以我没去。", "Yīnwèi xià yǔ, suǒyǐ wǒ méi qù.", "Because it rained, I didn't go."],
      ["因为很忙，所以他很累。", "Yīnwèi hěn máng, suǒyǐ tā hěn lèi.", "Because he's busy, he's tired."]
    ],
    quiz: { q: "Which word introduces the reason?", options: ["所以", "因为", "但是", "虽然"], answer: 1,
      note: "因为 = because (reason), 所以 = so (result)." }
  },
  {
    id: "g2-suiran", level: 2, marker: "虽然…但是", pinyin: "suīrán … dànshì", title: "虽然…但是 — although",
    en: "Like 因为…所以, this pair stays complete: 虽然 (although) … 但是 (but).",
    de: "Auch dieses Paar bleibt vollständig: 虽然 … 但是.",
    examples: [
      ["虽然很累，但是我很高兴。", "Suīrán hěn lèi, dànshì wǒ hěn gāoxìng.", "Although I'm tired, I'm happy."],
      ["虽然贵，但是很好。", "Suīrán guì, dànshì hěn hǎo.", "Although it's expensive, it's good."]
    ],
    quiz: { q: "Complete: 虽然很难，___ 我喜欢。", options: ["所以", "因为", "但是", "还是"], answer: 2,
      note: "虽然 pairs with 但是." }
  },
  {
    id: "g2-yao", level: 2, marker: "要 / 想 / 会", pinyin: "yào / xiǎng / huì", title: "要, 想, 会 — want, would like, can",
    en: "想 = would like to; 要 = want / will (stronger); 会 = can, as a learned skill; 能 = can, as in able right now.",
    de: "想 = möchte; 要 = will (stärker); 会 = können (gelernt); 能 = können (in der Lage sein).",
    examples: [
      ["我想去中国。", "Wǒ xiǎng qù Zhōngguó.", "I'd like to go to China."],
      ["我会说一点儿汉语。", "Wǒ huì shuō yìdiǎnr Hànyǔ.", "I can speak a little Chinese."]
    ],
    quiz: { q: "'I can swim' (learned skill) is:", options: ["我要游泳。", "我会游泳。", "我想游泳。", "我在游泳。"], answer: 1,
      note: "会 is for skills you learned." }
  },
  {
    id: "g2-ba", level: 2, marker: "吧", pinyin: "ba", title: "吧 — suggestions and guesses",
    en: "吧 at the end softens a sentence into a suggestion (我们走吧) or a guess (你是老师吧？).",
    de: "吧 am Satzende macht daraus einen Vorschlag (我们走吧) oder eine Vermutung.",
    examples: [
      ["我们一起去吧。", "Wǒmen yìqǐ qù ba.", "Let's go together."],
      ["你很累吧？", "Nǐ hěn lèi ba?", "You're tired, aren't you?"]
    ],
    quiz: { q: "Which sentence is a suggestion?", options: ["我们走吗？", "我们走吧。", "我们走了。", "我们走呢？"], answer: 1,
      note: "吗 asks, 吧 suggests." }
  },
  {
    id: "g2-li", level: 2, marker: "离", pinyin: "lí", title: "离 — distance between two places",
    en: "A 离 B + 远/近: 我家离学校很近. Use 从 for a starting point instead: 我从家来.",
    de: "A 离 B + 远/近: 我家离学校很近. Für den Ausgangspunkt steht 从.",
    examples: [
      ["我家离公司很远。", "Wǒ jiā lí gōngsī hěn yuǎn.", "My home is far from the office."],
      ["银行离这儿不远。", "Yínháng lí zhèr bù yuǎn.", "The bank isn't far from here."]
    ],
    quiz: { q: "Which is correct?", options: ["我家从学校很近。", "我家离学校很近。", "我家在学校很近。", "我家到学校近很。"], answer: 1,
      note: "离 expresses distance between two points." }
  },

  {
    id: "g3-ba-object", level: 3, marker: "把", pinyin: "bǎ", title: "把 — do something to an object",
    en: "把 moves the object before the verb to focus on what happens to it: 请把门关上。The verb needs a result or direction.",
    de: "把 stellt das Objekt vor das Verb und betont, was damit passiert: 请把门关上。Das Verb braucht ein Resultat.",
    examples: [
      ["请把书放在桌子上。", "Qǐng bǎ shū fàng zài zhuōzi shàng.", "Please put the book on the table."],
      ["我把作业写完了。", "Wǒ bǎ zuòyè xiě wán le.", "I finished writing the homework."]
    ],
    quiz: { q: "Which sentence uses 把 correctly?", options: ["我把书。", "我把书看。", "我把书看完了。", "把我书看完了。"], answer: 2,
      note: "把 sentences need a result: 看完了." }
  },
  {
    id: "g3-bei", level: 3, marker: "被", pinyin: "bèi", title: "被 — the passive",
    en: "Object + 被 (+ doer) + verb + result: 杯子被弟弟打破了。Often used for something unwanted.",
    de: "Objekt + 被 (+ Handelnder) + Verb + Resultat: 杯子被弟弟打破了。Oft für Unerwünschtes.",
    examples: [
      ["我的手机被拿走了。", "Wǒ de shǒujī bèi ná zǒu le.", "My phone was taken away."],
      ["蛋糕被他吃完了。", "Dàngāo bèi tā chī wán le.", "The cake was eaten by him."]
    ],
    quiz: { q: "Which sentence is passive?", options: ["他吃了蛋糕。", "蛋糕被他吃了。", "他把蛋糕吃了。", "他在吃蛋糕。"], answer: 1,
      note: "被 marks the passive; 把 is the active counterpart." }
  },
  {
    id: "g3-ruguo", level: 3, marker: "如果…就", pinyin: "rúguǒ … jiù", title: "如果…就 — if / then",
    en: "如果 introduces the condition, 就 the consequence: 如果下雨，我就不去。",
    de: "如果 leitet die Bedingung ein, 就 die Folge: 如果下雨，我就不去。",
    examples: [
      ["如果你有时间，就来我家。", "Rúguǒ nǐ yǒu shíjiān, jiù lái wǒ jiā.", "If you have time, come to my place."],
      ["如果太贵，我就不买。", "Rúguǒ tài guì, wǒ jiù bù mǎi.", "If it's too expensive, I won't buy it."]
    ],
    quiz: { q: "Complete: 如果明天下雨，我们 ___ 不去。", options: ["都", "就", "也", "还"], answer: 1,
      note: "就 marks the consequence of the condition." }
  },
  {
    id: "g3-yuelaiyue", level: 3, marker: "越来越", pinyin: "yuè lái yuè", title: "越来越 — more and more",
    en: "越来越 + adjective describes a growing tendency: 天气越来越冷。For two linked changes: 越…越….",
    de: "越来越 + Adjektiv beschreibt eine zunehmende Tendenz: 天气越来越冷。",
    examples: [
      ["他的汉语越来越好。", "Tā de Hànyǔ yuè lái yuè hǎo.", "His Chinese is getting better and better."],
      ["雨越下越大。", "Yǔ yuè xià yuè dà.", "The rain is getting heavier."]
    ],
    quiz: { q: "'It's getting hotter and hotter' is:", options: ["天气很热。", "天气越来越热。", "天气比较热。", "天气最热。"], answer: 1,
      note: "越来越 + adjective = increasingly." }
  },
  {
    id: "g3-chule", level: 3, marker: "除了…以外", pinyin: "chúle … yǐwài", title: "除了…以外 — except / besides",
    en: "With 都 it means 'except'; with 还/也 it means 'besides, in addition'.",
    de: "Mit 都 heißt es „außer“; mit 还/也 heißt es „außerdem“.",
    examples: [
      ["除了他以外，大家都来了。", "Chúle tā yǐwài, dàjiā dōu lái le.", "Everyone came except him."],
      ["除了汉语，我还学英语。", "Chúle Hànyǔ, wǒ hái xué Yīngyǔ.", "Besides Chinese, I also study English."]
    ],
    quiz: { q: "除了我以外，他们都去了 means:", options: ["Only I went.", "They all went except me.", "We all went.", "Nobody went."], answer: 1,
      note: "除了 … 都 = everyone/everything except." }
  },
  {
    id: "g3-yijing", level: 3, marker: "一边…一边", pinyin: "yìbiān … yìbiān", title: "一边…一边 — two actions at once",
    en: "一边 A 一边 B describes two simultaneous actions: 他一边喝茶一边看书。",
    de: "一边 A 一边 B beschreibt zwei gleichzeitige Handlungen.",
    examples: [
      ["她一边听音乐一边工作。", "Tā yìbiān tīng yīnyuè yìbiān gōngzuò.", "She works while listening to music."],
      ["别一边走一边看手机。", "Bié yìbiān zǒu yìbiān kàn shǒujī.", "Don't look at your phone while walking."]
    ],
    quiz: { q: "Which structure marks simultaneous actions?", options: ["先…再…", "一边…一边…", "因为…所以…", "越…越…"], answer: 1,
      note: "一边…一边… = doing two things at the same time." }
  },
  {
    id: "g3-xian-zai", level: 3, marker: "先…再", pinyin: "xiān … zài", title: "先…再 — first … then",
    en: "先 marks the first action, 再 the following one: 我们先吃饭，再去看电影。",
    de: "先 markiert die erste Handlung, 再 die folgende.",
    examples: [
      ["先复习，再考试。", "Xiān fùxí, zài kǎoshì.", "First review, then take the exam."],
      ["我先回家，再给你打电话。", "Wǒ xiān huí jiā, zài gěi nǐ dǎ diànhuà.", "I'll go home first, then call you."]
    ],
    quiz: { q: "Complete: 我们先吃饭，___ 去公园。", options: ["就", "再", "还", "都"], answer: 1,
      note: "先…再… puts two actions in order." }
  },
  {
    id: "g3-jiu-cai", level: 3, marker: "就 / 才", pinyin: "jiù / cái", title: "就 vs 才 — earlier than / later than expected",
    en: "就 says something happened sooner or easily; 才 says it happened later or with effort.",
    de: "就 heißt „früher/leichter als erwartet“, 才 „später/mühsamer als erwartet“.",
    examples: [
      ["他六点就来了。", "Tā liù diǎn jiù lái le.", "He came as early as six."],
      ["他九点才来。", "Tā jiǔ diǎn cái lái.", "He didn't come until nine."]
    ],
    quiz: { q: "'He only arrived at ten (late)' uses:", options: ["就", "才", "都", "还"], answer: 1,
      note: "才 signals later than expected." }
  },
  {
    id: "g4-chule", level: 4, marker: "除了…以外", pinyin: "chúle…yǐwài", title: "除了…以外 — except / besides",
    en: "除了 A 以外 has two readings, and the adverb decides which: with 都 it excludes A, with 还/也 it includes A and adds more.",
    de: "除了 A 以外 hat zwei Lesarten, das Adverb entscheidet: mit 都 wird A ausgeschlossen, mit 还/也 wird A eingeschlossen und ergänzt.",
    examples: [
      ["除了他以外，大家都来了。", "Chúle tā yǐwài, dàjiā dōu lái le.", "Everyone came except him."],
      ["除了汉语以外，他还会法语。", "Chúle Hànyǔ yǐwài, tā hái huì Fǎyǔ.", "Besides Chinese, he also speaks French."]
    ],
    quiz: { q: "除了小王以外，我们都去。 What does this mean?", options: ["Xiao Wang goes too", "Everyone goes except Xiao Wang", "Only Xiao Wang goes", "Nobody goes"], answer: 1,
      note: "都 in the second half means A is excluded." }
  },
  {
    id: "g4-jishi", level: 4, marker: "即使…也", pinyin: "jíshǐ…yě", title: "即使…也 — even if",
    en: "即使 introduces a hypothetical concession; the second clause always carries 也. Compare 虽然 (real fact) with 即使 (hypothetical).",
    de: "即使 leitet eine hypothetische Einräumung ein; der zweite Teil trägt immer 也. 虽然 = Tatsache, 即使 = Hypothese.",
    examples: [
      ["即使下雨，我也去。", "Jíshǐ xià yǔ, wǒ yě qù.", "Even if it rains, I'll go."],
      ["即使很贵，他也想买。", "Jíshǐ hěn guì, tā yě xiǎng mǎi.", "Even if it's expensive, he still wants to buy it."]
    ],
    quiz: { q: "Which word must appear in the second clause after 即使?", options: ["都", "也", "就", "才"], answer: 1,
      note: "即使 … 也 … is a fixed pair." }
  },
  {
    id: "g4-wulun", level: 4, marker: "无论…都", pinyin: "wúlùn…dōu", title: "无论 / 不管…都 — no matter",
    en: "无论 (written) and 不管 (spoken) need an open element after them — a question word, an A-not-A, or 还是 — and 都/也 in the second clause.",
    de: "无论 (schriftlich) und 不管 (mündlich) brauchen danach etwas Offenes — Fragewort, A-nicht-A oder 还是 — und 都/也 im zweiten Teil.",
    examples: [
      ["无论多难，我都会坚持。", "Wúlùn duō nán, wǒ dōu huì jiānchí.", "No matter how hard it is, I'll keep going."],
      ["不管你去不去，我都去。", "Bùguǎn nǐ qù bu qù, wǒ dōu qù.", "Whether you go or not, I'm going."]
    ],
    quiz: { q: "Which sentence is correct?", options: ["不管很难，我都试。", "不管多难，我都试。", "不管难，我试。", "不管难都我试。"], answer: 1,
      note: "不管 needs an open element such as 多难 or 去不去." }
  },
  {
    id: "g4-yinci", level: 4, marker: "由于…因此", pinyin: "yóuyú…yīncǐ", title: "由于 / 因此 — formal cause and effect",
    en: "由于 states a cause in written style and pairs with 因此 or 所以. 因此 can also open a sentence on its own; 由于 cannot end one.",
    de: "由于 nennt schriftsprachlich den Grund und steht mit 因此 oder 所以. 因此 kann auch allein einen Satz eröffnen; 由于 nicht.",
    examples: [
      ["由于天气不好，比赛取消了。", "Yóuyú tiānqì bù hǎo, bǐsài qǔxiāo le.", "Because of the bad weather, the match was cancelled."],
      ["价格上涨了，因此我们改变了计划。", "Jiàgé shàngzhǎng le, yīncǐ wǒmen gǎibiàn le jìhuà.", "Prices went up, therefore we changed the plan."]
    ],
    quiz: { q: "Which pair belongs to the formal written register?", options: ["因为…所以", "由于…因此", "虽然…但是", "一边…一边"], answer: 1,
      note: "由于…因此 is the written counterpart of 因为…所以." }
  },
  {
    id: "g4-shirang", level: 4, marker: "使 / 让", pinyin: "shǐ / ràng", title: "使 and 让 — making someone do or feel",
    en: "让 (spoken) and 使 (written, mostly for feelings and abstract results) take a person plus what they end up doing or feeling: Subject + 让/使 + person + verb/adjective.",
    de: "让 (mündlich) und 使 (schriftlich, meist bei Gefühlen und abstrakten Folgen) stehen mit Person plus Folge: Subjekt + 让/使 + Person + Verb/Adjektiv.",
    examples: [
      ["这个消息让我很吃惊。", "Zhège xiāoxi ràng wǒ hěn chījīng.", "This news really surprised me."],
      ["运动使人健康。", "Yùndòng shǐ rén jiànkāng.", "Exercise makes people healthy."]
    ],
    quiz: { q: "Which sentence is natural?", options: ["这个电影让我。", "这个电影让我很感动。", "这个电影使很感动我。", "这个电影让很感动。"], answer: 1,
      note: "让/使 needs both the person and the resulting state." }
  },
  {
    id: "g4-zhe", level: 4, marker: "着", pinyin: "zhe", title: "着 — an ongoing state",
    en: "着 after a verb marks a state that stays, not an action in progress: 在 says what someone is doing, 着 says how something remains. It also links a background action to a main one.",
    de: "着 nach dem Verb markiert einen andauernden Zustand, keine laufende Handlung: 在 sagt, was jemand gerade tut, 着 sagt, wie etwas bleibt. Es verbindet auch Nebenhandlung und Haupthandlung.",
    examples: [
      ["门开着。", "Mén kāi zhe.", "The door is (standing) open."],
      ["他站着看书。", "Tā zhàn zhe kàn shū.", "He reads standing up."]
    ],
    quiz: { q: "Which sentence describes a lasting state?", options: ["他在开门。", "门开着。", "他开了门。", "他要开门。"], answer: 1,
      note: "着 describes the state that remains; 在 describes the action in progress." }
  },
  {
    id: "g4-chadian", level: 4, marker: "差点儿", pinyin: "chàdiǎnr", title: "差点儿 — almost happened",
    en: "差点儿 means something nearly happened. With an unwanted event it is a relief either way: 差点儿迟到 and 差点儿没迟到 both mean you were not late.",
    de: "差点儿 heißt „beinahe“. Bei etwas Unerwünschtem bedeutet beides dasselbe: 差点儿迟到 und 差点儿没迟到 heißen, dass man nicht zu spät kam.",
    examples: [
      ["我差点儿迟到了。", "Wǒ chàdiǎnr chídào le.", "I was almost late."],
      ["他差点儿没赶上火车。", "Tā chàdiǎnr méi gǎn shàng huǒchē.", "He very nearly missed the train."]
    ],
    quiz: { q: "我差点儿丢了钱包。 Did the wallet get lost?", options: ["Yes, it was lost", "No, it was nearly lost", "It is still missing", "Someone else lost it"], answer: 1,
      note: "差点儿 + unwanted event = it did not happen." }
  },
  {
    id: "g4-renhe", level: 4, marker: "谁都 / 什么都", pinyin: "shéi dōu / shénme dōu", title: "Question word + 都 — any and every",
    en: "A question word plus 都/也 stops asking and starts generalising: 谁都 (anyone), 什么都 (anything), 哪儿都 (anywhere). With 不/没 it becomes 'none at all'.",
    de: "Fragewort + 都/也 fragt nicht mehr, sondern verallgemeinert: 谁都 (jeder), 什么都 (alles), 哪儿都 (überall). Mit 不/没 wird daraus „gar nichts“.",
    examples: [
      ["他什么都知道。", "Tā shénme dōu zhīdào.", "He knows everything."],
      ["我哪儿都不想去。", "Wǒ nǎr dōu bù xiǎng qù.", "I don't want to go anywhere."]
    ],
    quiz: { q: "How do you say 'I don't eat anything'?", options: ["我什么吃不。", "我不什么都吃。", "我什么都不吃。", "我都什么不吃。"], answer: 2,
      note: "Question word + 都 + negation: 什么都不吃." }
  }
];

/* Sentence builder material. chunks[] are the tiles the learner reorders. */
export const SENTENCES = [
  { level: 1, chunks: ["我", "喜欢", "中国菜"], pinyin: "Wǒ xǐhuan Zhōngguó cài.", en: "I like Chinese food.", note: "Subject – verb – object, just like English." },
  { level: 1, chunks: ["我", "是", "学生"], pinyin: "Wǒ shì xuéshēng.", en: "I am a student.", note: "是 links two nouns." },
  { level: 1, chunks: ["他", "在", "学校"], pinyin: "Tā zài xuéxiào.", en: "He is at school.", note: "在 + place says where someone is." },
  { level: 1, chunks: ["今天", "天气", "很好"], pinyin: "Jīntiān tiānqì hěn hǎo.", en: "The weather is nice today.", note: "Time expressions come early in the sentence." },
  { level: 1, chunks: ["我", "有", "两个", "朋友"], pinyin: "Wǒ yǒu liǎng ge péngyou.", en: "I have two friends.", note: "Number + measure word + noun." },
  { level: 1, chunks: ["你", "叫", "什么", "名字"], pinyin: "Nǐ jiào shénme míngzi?", en: "What is your name?", note: "Question words stay where the answer would be." },
  { level: 1, chunks: ["我", "不", "喝", "咖啡"], pinyin: "Wǒ bù hē kāfēi.", en: "I don't drink coffee.", note: "不 goes directly before the verb." },
  { level: 1, chunks: ["她", "是", "我的", "老师"], pinyin: "Tā shì wǒ de lǎoshī.", en: "She is my teacher.", note: "的 marks possession." },
  { level: 1, chunks: ["我们", "明天", "去", "北京"], pinyin: "Wǒmen míngtiān qù Běijīng.", en: "We are going to Beijing tomorrow.", note: "Time goes before the verb, not after it." },
  { level: 1, chunks: ["这", "本", "书", "很", "好"], pinyin: "Zhè běn shū hěn hǎo.", en: "This book is good.", note: "很 links subject and adjective." },
  { level: 1, chunks: ["我", "想", "喝", "茶"], pinyin: "Wǒ xiǎng hē chá.", en: "I want to drink tea.", note: "想 comes before the main verb." },
  { level: 1, chunks: ["他", "在", "家", "看", "电视"], pinyin: "Tā zài jiā kàn diànshì.", en: "He watches TV at home.", note: "Place comes before the verb." },
  { level: 1, chunks: ["你", "是", "学生", "吗"], pinyin: "Nǐ shì xuéshēng ma?", en: "Are you a student?", note: "吗 always sits at the end." },
  { level: 1, chunks: ["我", "的", "猫", "很", "小"], pinyin: "Wǒ de māo hěn xiǎo.", en: "My cat is small.", note: "Modifier + 的 + noun." },
  { level: 1, chunks: ["请", "给", "我", "一杯水"], pinyin: "Qǐng gěi wǒ yì bēi shuǐ.", en: "Please give me a glass of water.", note: "给 takes the receiver first, then the thing." },

  { level: 2, chunks: ["他", "比", "我", "高"], pinyin: "Tā bǐ wǒ gāo.", en: "He is taller than me.", note: "A 比 B + adjective, without 很." },
  { level: 2, chunks: ["我", "去过", "中国"], pinyin: "Wǒ qù guo Zhōngguó.", en: "I have been to China.", note: "过 marks a past experience." },
  { level: 2, chunks: ["她", "说", "得", "很好"], pinyin: "Tā shuō de hěn hǎo.", en: "She speaks very well.", note: "Verb + 得 + adjective describes how." },
  { level: 2, chunks: ["我", "每天", "早上", "跑步"], pinyin: "Wǒ měi tiān zǎoshang pǎo bù.", en: "I jog every morning.", note: "Bigger time unit first: 每天 then 早上." },
  { level: 2, chunks: ["因为", "下雨", "所以", "我", "没去"], pinyin: "Yīnwèi xià yǔ, suǒyǐ wǒ méi qù.", en: "Because it rained, I didn't go.", note: "Both halves of 因为…所以 stay." },
  { level: 2, chunks: ["我们", "一起", "去", "吧"], pinyin: "Wǒmen yìqǐ qù ba.", en: "Let's go together.", note: "吧 turns it into a suggestion." },
  { level: 2, chunks: ["我家", "离", "学校", "很近"], pinyin: "Wǒ jiā lí xuéxiào hěn jìn.", en: "My home is close to school.", note: "A 离 B + 远/近." },
  { level: 2, chunks: ["他", "正在", "打电话"], pinyin: "Tā zhèngzài dǎ diànhuà.", en: "He is on the phone.", note: "正在 + verb = right now." },
  { level: 2, chunks: ["这件", "衣服", "太", "贵", "了"], pinyin: "Zhè jiàn yīfu tài guì le.", en: "These clothes are too expensive.", note: "太 … 了 is a fixed pair." },
  { level: 2, chunks: ["我", "已经", "吃", "过", "饭", "了"], pinyin: "Wǒ yǐjīng chī guo fàn le.", en: "I have already eaten.", note: "已经 … 了 frames a completed action." },
  { level: 2, chunks: ["请", "等", "一下"], pinyin: "Qǐng děng yíxià.", en: "Please wait a moment.", note: "一下 softens a request." },
  { level: 2, chunks: ["虽然", "很累", "但是", "很", "高兴"], pinyin: "Suīrán hěn lèi, dànshì hěn gāoxìng.", en: "Although tired, I'm happy.", note: "虽然 pairs with 但是." },
  { level: 2, chunks: ["我", "想", "买", "一个", "新", "手机"], pinyin: "Wǒ xiǎng mǎi yí ge xīn shǒujī.", en: "I want to buy a new phone.", note: "Number + measure word + adjective + noun." },
  { level: 2, chunks: ["他", "从", "德国", "来"], pinyin: "Tā cóng Déguó lái.", en: "He comes from Germany.", note: "从 + place comes before the verb." },
  { level: 2, chunks: ["我", "给", "妈妈", "打电话"], pinyin: "Wǒ gěi māma dǎ diànhuà.", en: "I call my mum.", note: "给 + person before the verb phrase." },

  { level: 3, chunks: ["请", "把", "门", "关上"], pinyin: "Qǐng bǎ mén guān shàng.", en: "Please close the door.", note: "把 + object + verb + result." },
  { level: 3, chunks: ["蛋糕", "被", "他", "吃完了"], pinyin: "Dàngāo bèi tā chī wán le.", en: "The cake was eaten by him.", note: "被 marks the passive." },
  { level: 3, chunks: ["如果", "下雨", "我", "就", "不去"], pinyin: "Rúguǒ xià yǔ, wǒ jiù bú qù.", en: "If it rains, I won't go.", note: "如果 … 就 … links condition and result." },
  { level: 3, chunks: ["他的", "汉语", "越来越", "好"], pinyin: "Tā de Hànyǔ yuè lái yuè hǎo.", en: "His Chinese is getting better.", note: "越来越 + adjective." },
  { level: 3, chunks: ["我们", "先", "吃饭", "再", "看电影"], pinyin: "Wǒmen xiān chī fàn, zài kàn diànyǐng.", en: "We'll eat first, then watch a film.", note: "先 … 再 … orders two actions." },
  { level: 3, chunks: ["除了", "他", "大家", "都", "来了"], pinyin: "Chúle tā, dàjiā dōu lái le.", en: "Everyone came except him.", note: "除了 … 都 … = except." },
  { level: 3, chunks: ["她", "一边", "听音乐", "一边", "工作"], pinyin: "Tā yìbiān tīng yīnyuè yìbiān gōngzuò.", en: "She works while listening to music.", note: "一边 … 一边 … = at the same time." },
  { level: 3, chunks: ["我", "决定", "去", "中国", "学习"], pinyin: "Wǒ juédìng qù Zhōngguó xuéxí.", en: "I decided to study in China.", note: "One verb can take another verb phrase as its object." },
  { level: 3, chunks: ["这个", "问题", "很", "容易", "解决"], pinyin: "Zhège wèntí hěn róngyì jiějué.", en: "This problem is easy to solve.", note: "容易 + verb = easy to do." },
  { level: 3, chunks: ["他", "总是", "迟到"], pinyin: "Tā zǒngshì chídào.", en: "He is always late.", note: "Adverbs like 总是 sit before the verb." },
  { level: 3, chunks: ["最近", "我", "特别", "忙"], pinyin: "Zuìjìn wǒ tèbié máng.", en: "I've been especially busy lately.", note: "Time word first, then subject." },
  { level: 3, chunks: ["我", "需要", "你的", "帮助"], pinyin: "Wǒ xūyào nǐ de bāngzhù.", en: "I need your help.", note: "的 links possessor and noun." },
  { level: 3, chunks: ["银行", "在", "超市", "旁边"], pinyin: "Yínháng zài chāoshì pángbiān.", en: "The bank is next to the supermarket.", note: "Position words follow the place noun." },
  { level: 3, chunks: ["他", "刚才", "还", "在", "这儿"], pinyin: "Tā gāngcái hái zài zhèr.", en: "He was still here just now.", note: "刚才 refers to the very recent past." },
  { level: 3, chunks: ["我", "终于", "听懂", "了"], pinyin: "Wǒ zhōngyú tīng dǒng le.", en: "I finally understood.", note: "听懂 is verb + result compound." },
  { level: 4, chunks: ["除了", "他", "以外", "大家", "都", "同意"], pinyin: "Chúle tā yǐwài, dàjiā dōu tóngyì.", en: "Everyone agrees except him.", note: "除了…以外 with 都 excludes the person named." },
  { level: 4, chunks: ["即使", "很忙", "他", "也", "会", "来"], pinyin: "Jíshǐ hěn máng, tā yě huì lái.", en: "Even if he's busy, he'll come.", note: "即使 always pairs with 也." },
  { level: 4, chunks: ["由于", "堵车", "我", "迟到", "了"], pinyin: "Yóuyú dǔchē, wǒ chídào le.", en: "Because of the traffic I was late.", note: "由于 opens a written-style reason." },
  { level: 4, chunks: ["这个", "消息", "让", "我", "很", "吃惊"], pinyin: "Zhège xiāoxi ràng wǒ hěn chījīng.", en: "This news surprised me.", note: "让 + person + resulting state." },
  { level: 4, chunks: ["无论", "多难", "我", "都", "会", "坚持"], pinyin: "Wúlùn duō nán, wǒ dōu huì jiānchí.", en: "No matter how hard, I'll keep going.", note: "无论 needs an open element and 都." },
  { level: 4, chunks: ["他", "什么", "都", "不", "说"], pinyin: "Tā shénme dōu bù shuō.", en: "He says nothing at all.", note: "Question word + 都 + negation." },
  { level: 4, chunks: ["我", "差点儿", "忘了", "这件事"], pinyin: "Wǒ chàdiǎnr wàng le zhè jiàn shì.", en: "I almost forgot about this.", note: "差点儿 = it nearly happened." },
  { level: 4, chunks: ["门", "开", "着"], pinyin: "Mén kāi zhe.", en: "The door is open.", note: "着 marks the state that remains." },
  { level: 4, chunks: ["随着", "时间", "过去", "他", "越来越", "好"], pinyin: "Suízhe shíjiān guòqù, tā yuè lái yuè hǎo.", en: "As time passed he got better and better.", note: "随着 + change, then the result." },
  { level: 4, chunks: ["这个", "问题", "值得", "讨论"], pinyin: "Zhège wèntí zhídé tǎolùn.", en: "This question is worth discussing.", note: "值得 takes a verb directly." },
  { level: 4, chunks: ["他", "不但", "会", "开车", "而且", "开得", "很好"], pinyin: "Tā búdàn huì kāichē, érqiě kāi de hěn hǎo.", en: "He can not only drive, he drives well.", note: "不但…而且 raises the second point." },
  { level: 4, chunks: ["我", "对", "这个", "工作", "很", "感兴趣"], pinyin: "Wǒ duì zhège gōngzuò hěn gǎn xìngqù.", en: "I'm interested in this job.", note: "对 + topic comes before the predicate." },
  { level: 4, chunks: ["会议", "推迟", "到", "下周", "了"], pinyin: "Huìyì tuīchí dào xià zhōu le.", en: "The meeting was postponed to next week.", note: "到 + time marks the new endpoint." },
  { level: 4, chunks: ["他", "被", "老板", "批评", "了"], pinyin: "Tā bèi lǎobǎn pīpíng le.", en: "He was criticised by the boss.", note: "被 + doer + verb, usually for something unwelcome." },
  { level: 4, chunks: ["只要", "你", "努力", "就", "会", "成功"], pinyin: "Zhǐyào nǐ nǔlì, jiù huì chénggōng.", en: "As long as you work hard, you'll succeed.", note: "只要…就 links a sufficient condition to its result." }
];

/* Tone practice. Each set is one syllable in different tones. */
export const TONE_SETS = [
  { base: "ma", items: [["mā", 1, "妈", "mother"], ["má", 2, "麻", "hemp"], ["mǎ", 3, "马", "horse"], ["mà", 4, "骂", "to scold"]] },
  { base: "shu", items: [["shū", 1, "书", "book"], ["shú", 2, "熟", "ripe"], ["shǔ", 3, "数", "to count"], ["shù", 4, "树", "tree"]] },
  { base: "wen", items: [["wēn", 1, "温", "warm"], ["wén", 2, "闻", "to smell"], ["wěn", 3, "稳", "steady"], ["wèn", 4, "问", "to ask"]] },
  { base: "mai", items: [["mái", 2, "埋", "to bury"], ["mǎi", 3, "买", "to buy"], ["mài", 4, "卖", "to sell"]] },
  { base: "shui", items: [["shuī", 1, "谁", "who (variant)"], ["shuǐ", 3, "水", "water"], ["shuì", 4, "睡", "to sleep"]] },
  { base: "hao", items: [["hāo", 1, "蒿", "wormwood"], ["háo", 2, "毫", "fine hair"], ["hǎo", 3, "好", "good"], ["hào", 4, "号", "number"]] },
  { base: "xi", items: [["xī", 1, "西", "west"], ["xí", 2, "习", "to practise"], ["xǐ", 3, "洗", "to wash"], ["xì", 4, "戏", "drama"]] },
  { base: "tang", items: [["tāng", 1, "汤", "soup"], ["táng", 2, "糖", "sugar"], ["tǎng", 3, "躺", "to lie down"], ["tàng", 4, "烫", "scalding"]] },
  { base: "ji", items: [["jī", 1, "鸡", "chicken"], ["jí", 2, "急", "urgent"], ["jǐ", 3, "几", "how many"], ["jì", 4, "记", "to record"]] },
  { base: "guo", items: [["guō", 1, "锅", "pot"], ["guó", 2, "国", "country"], ["guǒ", 3, "果", "fruit"], ["guò", 4, "过", "to pass"]] },
  { base: "bei", items: [["bēi", 1, "杯", "cup"], ["běi", 3, "北", "north"], ["bèi", 4, "被", "passive marker"]] },
  { base: "yan", items: [["yān", 1, "烟", "smoke"], ["yán", 2, "盐", "salt"], ["yǎn", 3, "眼", "eye"], ["yàn", 4, "厌", "to dislike"]] }
];

export const TONE_INFO = [
  { tone: 1, name: "First tone", mark: "ˉ", desc: "High and flat, held steady — like holding a note.", example: "mā 妈" },
  { tone: 2, name: "Second tone", mark: "ˊ", desc: "Rising, as if asking 'huh?'.", example: "má 麻" },
  { tone: 3, name: "Third tone", mark: "ˇ", desc: "Dips low, then rises. In normal speech it often just stays low.", example: "mǎ 马" },
  { tone: 4, name: "Fourth tone", mark: "ˋ", desc: "Falls sharply, like a firm command.", example: "mà 骂" },
  { tone: 5, name: "Neutral tone", mark: "·", desc: "Short and light, no tone of its own: māma, xièxie.", example: "ma 吗" }
];
