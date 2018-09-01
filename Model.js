/**
 * AWS Lamdba Node.js 6.10環境で動作確認
 */

exports.readDynamoItem = function(params, callback) {
    var AWS = require('aws-sdk');
    var dynamo = new AWS.DynamoDB({
        region: ''
    });
    
    dynamo.query(params, function(err, data) {
        console.log("dynamo_data:", data);
        console.log("dynamo_err:", err);
        console.log(data.Count);
        
        var object = null;
        
        if (data.Count > 0) {
            var object = data.Items[0];
        }
        callback(object);
    });
}