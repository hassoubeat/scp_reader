/**
 * AWS Lamdba Node.js 6.10環境で動作確認
 */

'use strict';
const Alexa = require('alexa-sdk');

// DB操作処理の読み込み
var model = require('./Model.js');

// ステートの定義
const STATES = {
    HOME_MODE: '_HOME_MODE',
    READING_MODE: '_READING_MODE',
    DIV_READING_MODE: '_DIV_READING_MODE'
};

// システム定数の定義
const CODE = {
    ER_SUCCESS_MATCH: 'ER_SUCCESS_MATCH',
    SESSION_TABLE:"scp_reader_session_table",
    BOOKMARK_OBJECT_NUMBER: "bookmark_object_number", // セッションで保持する値
    BOOKMARK_OBJECT_ORDER: "_bookmark_order", // セッションで保持する値
    CALC_NUM: "calc_num", // セッションで保持する値
    S3_HOMECARD_EXTENSION: ".jpg"
}

// 各種URLのリンク
const URL = {
    SCP_WIKI_DOMAIN: 'http://www.scp-wiki.net/',
    SCP_WIKI_JP_DOMAIN: 'http://ja.scp-wiki.net/',
    // ホームカードに表示する画像を配置するS3のフォルダ
    S3_HOMECARD_PICTURE_URL: '',
    // ヘルプ呼び出し時のホームカードに表示する画像
    HELP_CARD_PICTURE_URL: ''
};

// メッセージ定数
const MESSAGE = {
    WELCOME_MESSAGE: 'ようこそ財団職員様。本日はどのオブジェクトの資料を音読致しますか？',
    HOME_MESSAGE: 'どのオブジェクトの資料を音読致しますか？',
    HELP_MESSAGE: '本システムはSCP財団で収容しているオブジェクトについての資料を音読するシステムです。確認したいオブジェクト番号を言ってください。',
    HELP_CARD_MESSAGE: 'SCPReaderはSCP財団で収容しているオブジェクトについての資料を音読するシステムです。' + "\n" + '確認したいオブジェクト番号を教えてください。' + "\n \n" + '音読を依頼する際は「XXX(オブジェクト番号)」' + "\n" + '音読を停止する際は「止めて」' + "\n" + 'システムを停止する際は「終了」' + "\n \n" + '現在、SCP001〜SCP1000、SCP001JP〜SCP1000JPに対応しています。' + "\n" + '※ それ以外の番号は認識しません。ご了承ください。',
    NOT_MATCH_OBJECT_MESSAGE_READING: '恐れ入りますが、改めてオブジェクト番号の指定をお願いします。',
    OBJECT_NOT_FOUND_MESSAGE: '指定されたオブジェクトがデータベースに存在しませんでした。',
    SHUTDOWN_MESSAGE: 'システムを終了します。お疲れ様でした。',
    DIVIVE_ALEAT_MESSAGE:"テキスト量が多いオブジェクトのため、分割して音読します。",
    CHECK_READ_MORE_MESSAGE:"前回、途中まで読んでいるオブジェクトです。続きから音読しますか？それとも最初から音読しますか？",
    CHECK_NEXT_OBJECT_MESSAGE: '次のオブジェクトを音読しますか？',
    CHECK_NEXT_DIV_MESSAGE: '続きを音読しますか？',
    REDING_FINISH_MESSAGE: 'オブジェクトの説明は以上となります。',
    PLEASE_READ_HOME_CARD_MESSAGE: '本オブジェクトのクレジットはAlexaアプリのホームカードをご確認ください。',
    CC_EXTEND_MESSAGE: '本作品は CC BY-SA 3.0 ライセンスによって許諾されています。ライセンスの内容を知りたい方は https://creativecommons.org/licenses/by-sa/3.0/deed.ja でご確認ください。',
    NOT_OPTIMIZATION_MESSAGE: '音読の最適化がされていないオブジェクトです。'
};

const handlers = {
    // 起動時の処理
    "LaunchRequest": function () {
        this.handler.state = STATES.HOME_MODE;
        if(!isset(this.event.request.intent)) {
            this.emit(":ask", MESSAGE.WELCOME_MESSAGE); 
        } else {
            this.emitWithState("SCPReadingIntent");
        }
    },
    'Unhandled': function() {
        this.emit("LaunchRequest");
    }
};

// SCPオブジェクトナンバーを受け付けるステート
var homeStateHandler = Alexa.CreateStateHandler(STATES.HOME_MODE, {
    'SCPReadingIntent': function () {
        if (this.event.request.intent.name != "SCPReadingIntent") {
            // 発声音声に一致するSCPオブジェクトが存在しなかった場合
            this.emitWithState("Unhandled");
        } else {
            // 発声音声に一致するSCPオブジェクトが存在した場合
            var object_number_voice_data = this.event.request.intent.slots.SCP_OBJECT_NUMBER;
            if (object_number_voice_data.resolutions["resolutionsPerAuthority"][0]["status"]["code"] != CODE.ER_SUCCESS_MATCH) {
                this.emitWithState("Unhandled");
            } else {
                var object_number = object_number_voice_data.resolutions["resolutionsPerAuthority"][0]["values"][0]["value"]["id"];
                this.attributes[CODE.BOOKMARK_OBJECT_NUMBER] = object_number;
                this.attributes[CODE.CALC_NUM] = 0;
                this.handler.state = STATES.READING_MODE;
                this.emitWithState("AMAZON.NextIntent");
            }
        }
    },
    "AMAZON.HelpIntent": function () {
        var picture_object = {
            smallImageUrl: URL.HELP_CARD_PICTURE_URL,
            largeImageUrl: URL.HELP_CARD_PICTURE_URL
        }
        this.emit(":askWithCard", MESSAGE.HELP_MESSAGE, MESSAGE.HOME_MESSAGE, 'SCPReaderについて', MESSAGE.HELP_CARD_MESSAGE, picture_object);
    },
    "AMAZON.CancelIntent": function () {
        this.emitWithState("AMAZON.StopIntent");
    },
    "AMAZON.StopIntent": function () {
        this.handler.state = '';
        delete this.attributes["STATE"];
        delete this.attributes[CODE.BOOKMARK_OBJECT_NUMBER];
        this.emit(":tell", MESSAGE.SHUTDOWN_MESSAGE);
    },
    'Unhandled': function() {
        this.emit(':ask', MESSAGE.NOT_MATCH_OBJECT_MESSAGE_READING, MESSAGE.HOME_MESSAGE);
    },
    'SessionEndedRequest': function () {
        this.emitWithState("AMAZON.StopIntent");
    }
});

// 通常の読み上げモード
var readingStateHandler = Alexa.CreateStateHandler(STATES.READING_MODE, {
    // 次のオブジェクトを読み上げる
    'AMAZON.NextIntent': function () {
        var calc_num = 1;
        // 前のオブジェクト指定時とソースを共用するための処理
        if (isset(this.attributes[CODE.CALC_NUM])) calc_num = this.attributes[CODE.CALC_NUM];
        delete this.attributes[CODE.CALC_NUM];
        console.log(this.attributes[CODE.BOOKMARK_OBJECT_NUMBER]);
        var object_number = calc_scp_object_number(this.attributes[CODE.BOOKMARK_OBJECT_NUMBER], calc_num);
        console.log(object_number);
        var params = {
            "TableName": "m_scp_object_ja",
            "KeyConditionExpression":"object_number = :object_number",
            "ExpressionAttributeValues": {
                ":object_number" : {"S": object_number}
            }
        };
        
        var object_number_array = object_number.split('-');
        var r_object_number = object_number_array[0] + object_number_array[1];
        if (object_number_array.indexOf("jp") >= 0) {
            r_object_number = r_object_number + object_number_array[2];
        }
        
        model.readDynamoItem(params, object => {
            if (object == null) {
                // オブジェクトが取得できなかった時
                this.handler.state = STATES.HOME_MODE;
                this.emit(":ask", '指定されたオブジェクト' + r_object_number + 'がデータベースに存在しませんでした。' + MESSAGE.NOT_MATCH_OBJECT_MESSAGE_READING, MESSAGE.HOME_MESSAGE);
            } else {
                // 分割記事であるかを確認する(原文、読上最適化文が指定されていない場合は分割記事と見なす)。
                if ((isset(object.m_content.S)) || (isset(object.r_content.S))) {
                    var reading_object = gen_reading_object(object, null);
                    this.handler.state = STATES.READING_MODE;
                    this.attributes[CODE.BOOKMARK_OBJECT_NUMBER] = object.object_number.S;
                    
                    reading_object['reading_content'] = reading_object['reading_content'] + MESSAGE.CHECK_NEXT_OBJECT_MESSAGE;
                    var reprompt_message = MESSAGE.CHECK_NEXT_OBJECT_MESSAGE;
                    
                    if (reading_object['picture_object'] == null) {
                        this.emit(":askWithCard", reading_object['reading_content'], reprompt_message, reading_object['card_title'], reading_object['card_content']);
                    } else {
                        this.emit(":askWithCard", reading_object['reading_content'], reprompt_message, reading_object['card_title'], reading_object['card_content'], reading_object['picture_object']);
                    }
                } else {
                    // 保持データから続きがあった場合続きを読むか確認する
                    if (object.object_number.S == this.attributes[CODE.BOOKMARK_OBJECT_NUMBER] && isset(this.attributes[object.object_number.S + CODE.BOOKMARK_OBJECT_ORDER])) {
                        this.handler.state = STATES.DIV_READING_MODE;
                        this.emit(":ask", MESSAGE.CHECK_READ_MORE_MESSAGE, MESSAGE.CHECK_READ_MORE_MESSAGE);
                    }
                    var params = {
                        "TableName": "divide_content_ja",
                        "KeyConditionExpression":"object_number = :object_number AND content_order = :content_order",
                        "ExpressionAttributeValues": {
                            ":object_number" : {"S": object.object_number.S},
                            ":content_order" : {"N": '1'}
                        }
                    };
                    model.readDynamoItem(params, divide_object=>{
                        if (divide_object == null) {
                            // オブジェクトが取得できなかった時
                            this.handler.state = STATES.HOME_MODE;
                            this.emit(":ask", '指定されたオブジェクト' + r_object_number +'がデータベースに存在しませんでした。' + MESSAGE.NOT_MATCH_OBJECT_MESSAGE_READING, MESSAGE.HOME_MESSAGE);
                        }
                        
                        this.handler.state = STATES.DIV_READING_MODE;
                        this.attributes[CODE.BOOKMARK_OBJECT_NUMBER] = object.object_number.S;
                        this.attributes[object.object_number.S + CODE.BOOKMARK_OBJECT_ORDER] = Number(divide_object.content_order.N);
    
                        var reading_object = gen_reading_object(object, divide_object)
                        
                        if (reading_object['picture_object'] == null) {
                            reading_object['reading_content'] = MESSAGE.DIVIVE_ALEAT_MESSAGE + '<break time="1.0s"/>' + reading_object['reading_content'] + '<break time="1.0s"/>' + MESSAGE.CHECK_NEXT_DIV_MESSAGE;
                            var reprompt_message = MESSAGE.CHECK_NEXT_DIV_MESSAGE;
                            this.emit(":askWithCard", reading_object['reading_content'], reprompt_message, reading_object['card_title'], reading_object['card_content']);
                        } else {
                            this.emit(":askWithCard", reading_object['reading_content'], reprompt_message, reading_object['card_title'], reading_object['card_content'], reading_object['picture_object']);
                        }
                    });
                }
            }
        });
    },
    // 前のオブジェクトを読み上げる
    'AMAZON.PreviousIntent': function () {
        this.attributes[CODE.CALC_NUM] = -1;
        this.emitWithState("AMAZON.NextIntent");
    },
    'SCPReadingIntent': function() {
        this.handler.state = STATES.HOME_MODE;
        this.emitWithState("SCPReadingIntent");
    },
    "AMAZON.YesIntent": function() {
        this.emitWithState("AMAZON.NextIntent");
    },
    "AMAZON.NoIntent" : function () {
        this.emitWithState("AMAZON.StopIntent");
    },
    "AMAZON.CancelIntent": function () {
        this.emitWithState("AMAZON.StopIntent");
    },
    "AMAZON.StopIntent": function () {
        this.handler.state = STATES.HOME_MODE;
        delete this.attributes[CODE.BOOKMARK_OBJECT_NUMBER];
        this.emit(":ask", MESSAGE.HOME_MESSAGE, MESSAGE.HOME_MESSAGE);
    },
    'Unhandled': function() {
        this.handler.state = STATES.HOME_MODE;
        this.emitWithState("Unhandled");
    },
    'SessionEndedRequest': function () {
        this.handler.state = STATES.HOME_MODE;
        this.emitWithState("SessionEndedRequest");
    }
});

// 分割記事を読み上げるモード
var divReadingStateHandler = Alexa.CreateStateHandler(STATES.DIV_READING_MODE, {
    "SCPContinueReadingIntent" : function () {
        var object_number = this.attributes[CODE.BOOKMARK_OBJECT_NUMBER];
        var object_bookmark_order = this.attributes[object_number + CODE.BOOKMARK_OBJECT_ORDER];
        // 次の記事を指定する
        object_bookmark_order = object_bookmark_order + 1;
        
        var params = {
            "TableName": "divide_content_ja",
            "KeyConditionExpression":"object_number = :object_number AND content_order = :content_order",
            "ExpressionAttributeValues": {
                ":object_number" : {"S": object_number},
                ":content_order" : {"N": String(object_bookmark_order)}
            }
        };
        model.readDynamoItem(params, divide_object=>{
            if (divide_object == null) {
                // オブジェクトが取得できなかった時
                this.handler.state = STATES.HOME_MODE;
                this.emit(":ask", MESSAGE.OBJECT_NOT_FOUND_MESSAGE, MESSAGE.HOME_MESSAGE);
            } else {
                var reading_content = "";
                if (isset(divide_object.r_content.S)) {
                    // 最適化された文章がある場合
                    reading_content = reading_content + divide_object.r_content.S;
                } else {
                    // 最適化された文章が無い場合
                    reading_content = reading_content + divide_object.m_content.S;
                }
                var reprompt_message = "";
                
                if (divide_object.finish_flg.BOOL) {
                    // 最後の記事だった場合
                    reading_content = reading_content + '<break time="1.0s"/>' + MESSAGE.REDING_FINISH_MESSAGE + '<break time="0.5s"/>' + MESSAGE.PLEASE_READ_HOME_CARD_MESSAGE + '<break time="1.0s"/>' + MESSAGE.CHECK_NEXT_OBJECT_MESSAGE; 
                    reprompt_message = MESSAGE.CHECK_NEXT_OBJECT_MESSAGE;
                    this.handler.state = STATES.READING_MODE;
                    this.attributes[CODE.BOOKMARK_OBJECT_NUMBER];
                    delete this.attributes[object_number + CODE.BOOKMARK_OBJECT_ORDER];
                } else {
                    // 次の記事がある場合
                    reading_content = reading_content + '<break time="1.0s"/>' + MESSAGE.CHECK_NEXT_DIV_MESSAGE;
                    reprompt_message = MESSAGE.CHECK_NEXT_DIV_MESSAGE;
                    this.attributes[CODE.BOOKMARK_OBJECT_NUMBER] = object_number;
                    this.attributes[object_number + CODE.BOOKMARK_OBJECT_ORDER] = object_bookmark_order;
                }
                // 分割されたオブジェクトの読上
                this.emit(":ask", reading_content, reprompt_message);
            }
        });
    },
    // 最初から読む場合
    "SCPResetReadingIntent": function() {
        var object_number = this.attributes[CODE.BOOKMARK_OBJECT_NUMBER];
        console.log(object_number);
        delete this.attributes[object_number + CODE.BOOKMARK_OBJECT_ORDER];
        this.attributes[CODE.CALC_NUM] = 0;
        this.handler.state = STATES.READING_MODE;
        this.emitWithState("AMAZON.NextIntent");
    },
    'SCPReadingIntent': function() {
        this.handler.state = STATES.HOME_MODE;
        this.emitWithState("SCPReadingIntent");
    },
    "AMAZON.YesIntent": function() {
        this.emitWithState("SCPContinueReadingIntent");
    },
    "AMAZON.NoIntent" : function () {
        this.emitWithState("AMAZON.StopIntent");
    },
    'AMAZON.NextIntent': function () {
        this.handler.state = STATES.READING_MODE;
        this.emitWithState("AMAZON.NextIntent");
    },
    'AMAZON.PreviousIntent': function () {
        this.handler.state = STATES.READING_MODE;
        this.emitWithState("AMAZON.PreviousIntent");
    },
    "AMAZON.CancelIntent": function () {
        this.emitWithState("AMAZON.StopIntent");
    },
    "AMAZON.StopIntent": function () {
        this.handler.state = STATES.HOME_MODE;
        this.emit(":ask", MESSAGE.HOME_MESSAGE, MESSAGE.HOME_MESSAGE);
    },
    'Unhandled': function() {
        this.handler.state = STATES.HOME_MODE;
        this.emitWithState("Unhandled");
    },
    'SessionEndedRequest': function () {
        this.handler.state = STATES.HOME_MODE;
        this.emitWithState("SessionEndedRequest");
    }
});

exports.handler = function (event, context, callback) {
    const alexa = Alexa.handler(event, context, callback);

    alexa.resources = "ja"; // 言語を設定
    alexa.dynamoDBTableName = CODE.SESSION_TABLE; 
    alexa.registerHandlers(handlers, homeStateHandler, readingStateHandler, divReadingStateHandler); // ハンドラの登録
    alexa.execute(); // 実行
};


function isset(data) {
    // TODO いずれDynamoの空をNULLで返すようにする
    if(data === "" || data === " " || data === "　" || data === null || data === undefined){
        return false;
    }else{
        return true;
    }
}

function calc_scp_object_number(object_number, calc_num) {
    var object_number_array = object_number.split('-');
    
    object_number_array[1] = Number(object_number_array[1]) + Number(calc_num);
    
    // 3桁未満の場合、0で穴埋めする。
    object_number_array[1] = String(object_number_array[1]);
    var object_number_char = object_number_array[1].split('');
    var roop = 3 - object_number_char.length;
    for(var i = 0; i < roop; i++) {
        object_number_array[1] = '0' + object_number_array[1];
    }
    
    object_number = object_number_array[0] + '-' + object_number_array[1];
    if (object_number_array.indexOf("jp") >= 0) {
        object_number = object_number + '-' + object_number_array[2];
    }
    return object_number;
}

function gen_reading_object(object, divide_object) {
    console.log(object);
    console.log(divide_object);
    // Alexaアプリに読ませる文言の生成
    var reading_content = "";
        
    // Alexaアプリに返すホームカードのタイトル
    var card_title = "";
    if (isset(object.card_title.S)) {
        card_title = object.card_title.S;
    } else {
        card_title = object.object_number.S;
    }
        
    // Alexaアプリに返すホームカードの内容(本家へのURLとライセンス表記)
    var card_content = "";
    
    // フレーバーテキスト
    if (isset(object.flavor_text.S)) {
        card_content = object.flavor_text.S + "\n　\n";
    }
    // 追加文章
    if (isset(object.card_content.S)) {
        card_content = card_content + object.card_content.S + "\n　\n";
    }
    // ライセンス関連
    var object_title = "タイトル：" + object.object_name.S;
    var object_writer = "クレジット : © " + object.credit.S;
    var object_site_url = "";
    
    var object_number_array = object.object_number.S.split('-');
    var r_object_number = object_number_array[0] + object_number_array[1];
    var object_region = "";
    if (object_number_array.indexOf("jp") >= 0) {
        object_region = 'jp';
        r_object_number = r_object_number + object_number_array[2];
    }
    
    switch (object_region) {
        case 'jp':
            object_site_url = URL.SCP_WIKI_JP_DOMAIN;
            break;
        default:
            object_site_url = URL.SCP_WIKI_DOMAIN;
    }
    var object_origin_article = "元記事 : " + object_site_url + object.object_number.S;
    card_content = card_content + "この作品は、下記作品に基づきます。\n" + object_title + "\n" + object_writer + "\n" + object_origin_article + "\n　\n" + MESSAGE.CC_EXTEND_MESSAGE;
    
    if (divide_object == null) {
        if (isset(object.r_content.S)) {
            // 最適化された文章がある場合
            reading_content = object.r_content.S;
        } else {
            // 最適化された文章が無い場合
            reading_content = MESSAGE.NOT_OPTIMIZATION_MESSAGE + '<break time="1.5s"/>' + object.m_content.S;
        }
        reading_content = reading_content + '<break time="1.0s"/>' + MESSAGE.REDING_FINISH_MESSAGE + '<break time="1.0s"/>' + MESSAGE.PLEASE_READ_HOME_CARD_MESSAGE + '<break time="1.0s"/>'; 
    } else {
        if (isset(divide_object.r_content.S)) {
            // 最適化された文章がある場合
            reading_content = reading_content + divide_object.r_content.S;
        } else {
            // 最適化された文章が無い場合
            reading_content = MESSAGE.NOT_OPTIMIZATION_MESSAGE + '<break time="1.5s"/>' + divide_object.m_content.S;
        }
        reading_content = reading_content + '<break time="1.0s"/>';;
    }
    
    // Alexaアプリに返すホームカードに表示する画像有無
    var picture_object = null;
    if (isset(object.card_picture_url.S)) {
        picture_object = {
            smallImageUrl: object.card_picture_url.S,
            largeImageUrl: object.card_picture_url.S
        }
    }
    
    // 連想配列にセットして返却する
    var reading_object = Array();
    reading_object['reading_content'] = reading_content;
    reading_object['card_title'] = card_title;
    reading_object['card_content'] = card_content;
    reading_object['picture_object'] = picture_object;
    return reading_object;
}