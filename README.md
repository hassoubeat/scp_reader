# scp_reader
□ はじめに
本プロジェクトはAmazonが提供するスマートスピーカー：Alexa(アレクサ)に指定したSCP(※)の記事を音読してもらうカスタムスキルです。
※ SCPとは... 創作シェアワールドの一つ。詳細はこちら https://ja.wikipedia.org/wiki/SCP%E8%B2%A1%E5%9B%A3

一般公開をしようと試みたのですが、SCP特有のゴア表現がAmazon的にNGだそうで、無理でした。
自分用に残しています。

簡易仕様書:https://drive.google.com/open?id=1FhRw2iG0NmSysCL79NbqSosMssA2jx6obNF66glagbk

□ 各ファイルの役割
./index.js ... AWS Lamdbaで動作するAlexaスキルからコールされる実処理部分です。
./Model.js ... 上記index.jsの補足処理です。
./scp_reader.json ... Alexaスキルの実装となります。内容のそのままJSONエディターに貼り付ければ使えます。

□ 実際に動かすまでの手順
① DynamoDBで簡易仕様書に定義しているテーブルを作成
② テーブルにデータを投入(※)
③ ホームカードでの画像表示用のS3バケットを作成
④ S3にデータを投入(※)
⑤ AWS LamdbaでAlexa用の関数作成
⑥ index.jsとModel.jsをそれぞれ配置
⑦ index.js、Model.jsのS3、DynamoDBのregion指定などを更新
⑧ AlexaDeveloperConsoleからカスタムスキルを作成
⑨ 作成したAlexaスキルのJSONエディターからscp_reader.jsonの内容をコピペ
⑩ Alexaスキルをテスト状態にして動作開始

※ データは必要であれば、お声がけいただければ差し上げます。

不明な点などあれば、簡易仕様書に記載されたアドレス宛にいただければレスポンスします。