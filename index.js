const Alexa = require("ask-sdk-core");
const AWS = require("aws-sdk");
const ddbAdapter = require("ask-sdk-dynamodb-persistence-adapter");

const TIMERS_PERMISSION = "alexa::alerts:timers:skill:readwrite";
const TIMER_FUNCTION = getAnnouncementTimer;

const { GoogleSpreadsheet } = require("google-spreadsheet");
const CREDIT = require("./googleCloudKey.json"); //create JSON key from Google Cloud Console
const SPREADSHEET_KEY = "1CFddzd4metK5wtml3v9Kz33XBdN1myfm1-pAdKVkEUM"; //replace with your own Google Spreadsheet ID
const DOC = new GoogleSpreadsheet(SPREADSHEET_KEY);

function getAnnouncementTimer(handlerInput, duration, label, textToAnnounce) {
  return {
    duration: duration,
    label: label,
    creationBehavior: {
      displayExperience: {
        visibility: "VISIBLE",
      },
    },
    triggeringBehavior: {
      operation: {
        type: "ANNOUNCE",
        textToAnnounce: [
          {
            locale: "ja-JP",
            text: textToAnnounce,
          },
        ],
      },
      notificationConfig: {
        playAudible: false,
      },
    },
  };
}

const isAPLSupported = function isAPLSupported(request) {
  return (
    request &&
    request.context &&
    request.context.System &&
    request.context.System.device &&
    request.context.System.device.supportedInterfaces &&
    request.context.System.device.supportedInterfaces["Alexa.Presentation.APL"]
  );
};

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest"
    );
  },
  handle(handlerInput) {
    const speakOutput = "おっぱいです。開始、終了、と言ってみよう！";

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

const StartTimerIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "StartTimerIntent"
    );
  },
  async handle(handlerInput) {
    const { attributesManager, serviceClientFactory } = handlerInput;

    const timer1 = TIMER_FUNCTION(
      handlerInput,
      "PT10M",
      "10分経過",
      "10分のお知らせです"
    );
    const timer2 = TIMER_FUNCTION(
      handlerInput,
      "PT20M",
      "20分経過",
      "20分のお知らせです"
    );
    const timer3 = TIMER_FUNCTION(
      handlerInput,
      "PT30M",
      "30分経過",
      "30分のお知らせです"
    );

    const apl = require("./apl.json");

    try {
      // save timeAtStart to DynamoDB
      const attributes = { timeAtStart: Date.now() };
      attributesManager.setPersistentAttributes(attributes);
      await attributesManager.savePersistentAttributes();
      // add entry for START and placeholder STOP (30 mins after START)
      await DOC.useServiceAccountAuth({
        client_email: CREDIT.client_email,
        private_key: CREDIT.private_key,
      });
      await DOC.loadInfo();
      const sheet = DOC.sheetsByTitle["fromAlexa"];
      await sheet.addRows([
        { category: "start", createdAt: attributes.timeAtStart },
        {
          category: "stop",
          createdAt: attributes.timeAtStart + 30 * 60 * 1000,
        },
      ]);
      // set timer
      const timerServiceClient = serviceClientFactory.getTimerManagementServiceClient();
      const timersList = await timerServiceClient.getTimers();
      console.log("Current timers: " + JSON.stringify(timersList));

      const timerResponse1 = await timerServiceClient.createTimer(timer1);
      const timerResponse2 = await timerServiceClient.createTimer(timer2);
      const timerResponse3 = await timerServiceClient.createTimer(timer3);

      console.log("All timers created");

      const timerId1 = await timerResponse1.id;
      const timerId2 = await timerResponse2.id;
      const timerId3 = await timerResponse3.id;

      console.log("timerID set");

      const timerStatus1 = await timerResponse1.status;
      const timerStatus2 = await timerResponse2.status;
      const timerStatus3 = await timerResponse3.status;

      console.log("timerStatus set");

      if (
        timerStatus1 === "ON" &&
        timerStatus2 === "ON" &&
        timerStatus3 === "ON"
      ) {
        const sessionAttributes = await attributesManager.getSessionAttributes();
        sessionAttributes["OppaiTimer1"] = timerId1;
        sessionAttributes["OppaiTimer2"] = timerId2;
        sessionAttributes["OppaiTimer3"] = timerId3;

        console.log("sessionAttributes set");

        const builder = handlerInput.responseBuilder.speak(
          "おっぱいタイマーを開始しました。"
        );

        if (isAPLSupported(handlerInput.requestEnvelope)) {
          builder.addDirective({
            type: "Alexa.Presentation.APL.RenderDocument",
            version: "1.0",
            document: apl.document,
          });
        }
        return builder.getResponse();
      } else
        throw {
          statusCode: 308,
          message: "Timer did not start",
        };
    } catch (error) {
      console.log("Create timer error: " + JSON.stringify(error));
      if (error.statusCode === 401) {
        console.log("Unauthorized!");
        // we send a request to enable by voice
        // note that you'll need another handler to process the result, see AskForResponseHandler
        return handlerInput.responseBuilder
          .addDirective({
            type: "Connections.SendRequest",
            name: "AskFor",
            payload: {
              "@type": "AskForPermissionsConsentRequest",
              "@version": "1",
              permissionScope: TIMERS_PERMISSION,
            },
            token: "verifier",
          })
          .getResponse();
      } else
        return handlerInput.responseBuilder
          .speak("タイマーがセットできませんでした。")
          .getResponse();
    }
  },
};

const StopTimerIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "StopTimerIntent"
    );
  },
  async handle(handlerInput) {
    const { attributesManager, serviceClientFactory } = handlerInput;
    const sessionAttributes = attributesManager.getSessionAttributes();
    const timerId1 = sessionAttributes["OppaiTimer1"];
    const timerId2 = sessionAttributes["OppaiTimer2"];
    const timerId3 = sessionAttributes["OppaiTimer3"];
    const goodbyeMsg = [
      "ゆうこ、授乳お疲れ様でした!",
      "ゆうこ、髪の毛まったく臭くないよ！",
      "ゆうこ、いつもありがとう。",
      "ゆうこ、せらちゃんを産んでくれてありがとう！",
      "ゆうこ、今日も美しいね！",
      "ゆうこ、愛してるよ！",
      "ゆうこ、育児って楽しいね！",
      "ゆうこ、いつも俺にも気を使ってくれてありがとう！",
      "ゆうこ、わがままになっていいんだからね！",
      "ゆうこ、ストレスは貯めずに俺にぶつけてね！",
      "ゆうこ、俺と結婚してくれてありがとう！",
      "ゆうこ、せらちゃんとキャンプ行くの楽しみだね！",
      "ゆうこ、6週間の洗髪しないチャレンジ、本当によく頑張ってるね！",
      "ゆうこ、食べたいものあったらいつでも教えてね！",
      "ゆうこ、おやすみなさい。",
      "ゆうこ、育児って楽しいね！",
      "ゆうこ、せらちゃん可愛いねえ",
      "僕はゆうこのおかげで毎日幸せです。",
      "ゆうこ、二人目はいつ作ろうか？",
      "ゆうこ、俺にだけはどんな本音もぶちまけてくれていいんだからね。",
      "ゆうこ、今日も最高の一日だ！",
    ];

    try {
      // get timeAtStart from DynamoDB
      const attributes =
        (await attributesManager.getPersistentAttributes()) || {};
      const timeAtEnd = attributes.timeAtStart + 30 * 60 * 1000;
      // update STOP entry with current time
      await DOC.useServiceAccountAuth({
        client_email: CREDIT.client_email,
        private_key: CREDIT.private_key,
      });
      await DOC.loadInfo();
      const sheet = DOC.sheetsByTitle["fromAlexa"];
      const rows = await sheet.getRows();
      const index = rows.findIndex(
        (item) => parseInt(item.createdAt) === parseInt(timeAtEnd)
      );
      if (index > 0) {
        rows[index].createdAt = Date.now();
        await rows[index].save();
      }

      const timerServiceClient = serviceClientFactory.getTimerManagementServiceClient();
      const timersList = await timerServiceClient.getTimers();
      console.log("Read timers: " + JSON.stringify(timersList));
      const totalCount = timersList.totalCount;
      if (totalCount === 0) {
        return handlerInput.responseBuilder
          .speak(goodbyeMsg)
          .withShouldEndSession(true)
          .getResponse();
      }
      if (timerId1 && timerId2 && timerId3) {
        await timerServiceClient.deleteTimer(timerId1);
        await timerServiceClient.deleteTimer(timerId2);
        await timerServiceClient.deleteTimer(timerId3);
        return handlerInput.responseBuilder
          .speak(
            "10分と20分と30分のおっぱいタイマーを終了しました。" +
              goodbyeMsg[Math.floor(Math.random() * goodbyeMsg.length)]
          )
          .withShouldEndSession(true)
          .getResponse();
      } else if (!timerId1 && timerId2 && timerId3) {
        await timerServiceClient.deleteTimer(timerId2);
        await timerServiceClient.deleteTimer(timerId3);
        return handlerInput.responseBuilder
          .speak(
            "20分と30分のおっぱいタイマーを終了しました。" +
              goodbyeMsg[Math.floor(Math.random() * goodbyeMsg.length)]
          )
          .withShouldEndSession(true)
          .getResponse();
      } else if (!timerId1 && !timerId2 && timerId3) {
        await timerServiceClient.deleteTimer(timerId3);
        return handlerInput.responseBuilder
          .speak(
            "30分のおっぱいタイマーを終了しました。" +
              goodbyeMsg[Math.floor(Math.random() * goodbyeMsg.length)]
          )
          .withShouldEndSession(true)
          .getResponse();
      } else {
        // warning, since there's no timer id we *cancel all 3P timers by the user*
        await timerServiceClient.deleteTimers();
        return handlerInput.responseBuilder
          .speak(
            "全てのタイマーを終了しました。" +
              goodbyeMsg[Math.floor(Math.random() * goodbyeMsg.length)]
          )
          .withShouldEndSession(true)
          .getResponse();
      }
    } catch (error) {
      console.log("Delete timer error: " + JSON.stringify(error));
      if (error.statusCode === 401) {
        console.log("Unauthorized!");
        // we send a request to enable by voice
        // note that you'll need another handler to process the result, see AskForResponseHandler
        return handlerInput.responseBuilder
          .addDirective({
            type: "Connections.SendRequest",
            name: "AskFor",
            payload: {
              "@type": "AskForPermissionsConsentRequest",
              "@version": "1",
              permissionScope: TIMERS_PERMISSION,
            },
            token: "verifier",
          })
          .getResponse();
      } else
        return handlerInput.responseBuilder
          .speak("おっぱいタイマーを終了できませんでした")
          .getResponse();
    }
  },
};

const AskForResponseHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Connections.Response" &&
      handlerInput.requestEnvelope.request.name === "AskFor"
    );
  },
  async handle(handlerInput) {
    console.log("Handler: AskForResponseHandler");
    const { request } = handlerInput.requestEnvelope;
    const { payload, status } = request;
    console.log(
      "Connections reponse status + payload: " +
        status +
        " - " +
        JSON.stringify(payload)
    );

    if (status.code === "200") {
      if (payload.status === "ACCEPTED") {
        // Request was accepted
        handlerInput.responseBuilder
          .speak("タイマーへのアクセス権を取得しました")
          .reprompt("タイマーへのアクセス権を取得しました");
      } else if (payload.status === "DENIED") {
        // Request was denied
        handlerInput.responseBuilder.speak(
          "タイマーへのアクセス権を取得できませんでした。スキルを終了します。"
        );
      } else if (payload.status === "NOT_ANSWERED") {
        // Request was not answered
        handlerInput.responseBuilder.speak(
          "タイマーへのアクセス権を取得できませんでした。スキルを終了します。"
        );
      }
      if (payload.status !== "ACCEPTED" && !payload.isCardThrown) {
        handlerInput.responseBuilder
          .speak(
            "お客様のAlexaアプリに、このスキルがタイマーを使用することを許可するためのカードを送りました。権限を許可していただいた後に、もう一度このスキルを呼び出してください。"
          )
          .withAskForPermissionsConsentCard([TIMERS_PERMISSION]);
      }
      return handlerInput.responseBuilder.getResponse();
    }

    if (status.code === "400") {
      console.log(
        "You forgot to specify the permission in the skill manifest!"
      );
    }

    if (status.code === "500") {
      return handlerInput.responseBuilder
        .speak(
          "タイマーの使用許可をいただく途中でエラーが起きてしまいました。後ほどもう一度お試しください。"
        )
        .getResponse();
    }
    // Something failed.
    console.log(
      `Connections.Response.AskFor indicated failure. error: ${request.status.message}`
    );

    return handlerInput.responseBuilder
      .speak(
        "タイマーの使用許可をいただく途中でエラーが起きてしまいました。後ほどもう一度お試しください。"
      )
      .getResponse();
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.HelpIntent"
    );
  },
  handle(handlerInput) {
    const speakOutput = "You can say hello to me! How can I help?";

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      (Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AMAZON.CancelIntent" ||
        Alexa.getIntentName(handlerInput.requestEnvelope) ===
          "AMAZON.StopIntent")
    );
  },
  handle(handlerInput) {
    const speakOutput = "おっぱいを終了します";

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .withShouldEndSession(true)
      .getResponse();
  },
};
/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet
 * */
const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AMAZON.FallbackIntent"
    );
  },
  handle(handlerInput) {
    const speakOutput = "Sorry, I don't know about that. Please try again.";

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};
/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs
 * */
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
      "SessionEndedRequest"
    );
  },
  handle(handlerInput) {
    console.log(
      `~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`
    );
    // Any cleanup logic goes here.
    return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
  },
};
/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents
 * by defining them above, then also adding them to the request handler chain below
 * */
const IntentReflectorHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest"
    );
  },
  handle(handlerInput) {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const speakOutput = `You just triggered ${intentName}`;

    return (
      handlerInput.responseBuilder
        .speak(speakOutput)
        //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
        .getResponse()
    );
  },
};
/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below
 * */
const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    const speakOutput =
      "すみませぬ、エラーが発生しました。もう一回やってみてちょ。";
    console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom
 * */
exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    StartTimerIntentHandler,
    StopTimerIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler,
    IntentReflectorHandler
  )
  .addErrorHandlers(ErrorHandler)
  .withApiClient(new Alexa.DefaultApiClient())
  .withPersistenceAdapter(
    new ddbAdapter.DynamoDbPersistenceAdapter({
      tableName: "OppaiTable",
      createTable: true,
      dynamoDBClient: new AWS.DynamoDB({
        apiVersion: "latest",
        region: "ap-northeast-1",
      }),
    })
  )
  .lambda();
