var AWS = require('aws-sdk');
var RESPONSE = require('cfn-response');

var esDomain = {
    index: 'taxdata',
    doctype: 'taxdata'
};
var s3 = new AWS.S3();
var docsTotal = 0;
var docsPosted = 0;

function listTaxData(bucket, prefix, context) {
  s3.listObjectsV2({Bucket: bucket, Prefix: prefix}, function(err, data) {
    if (err) {
      console.log(err, err.stack);
      context.fail();
    } else {
      console.log(data);
      filesTotal = data.Contents.length;
      data.Contents.forEach(function(datafile) {
        if (datafile.Size > 0) {
          parseTaxDataFromS3ToES(data.Name, datafile.Key, context);
        }
      });
    }
  });
}

function parseTaxDataFromS3ToES(bucket, key, context) {
  s3.getObject({Bucket: bucket, Key: key}, function(err, data) {
    if (err) {
      console.log(err, err.stack);
      context.fail();
    } else {
      console.log(data);
      var lines = data.Body.toString('utf8').split('\n');
      lines.splice(0, 1); //skip header line
      lines.forEach(function(line) {
        var lineItems = line.split(';');
        var esDocument = {};
        ++docsTotal;
        lineItems.forEach(function(item, index) {
          switch(index) {
            case 0:
              esDocument.year = item;
              break;
            case 1:
              esDocument.businessId = item;
              break;
            case 2:
              esDocument.name = item;
              break;
            case 3:
              if (item.indexOf(' ') === 3) {
                esDocument.municipalityNumber = item.substring(0, 3);
                esDocument.municipalityName = item.substring(4);
              } else {
                console.log("municipality parsing fail: " + item);
              }
              break;
            case 4:
              esDocument.taxableIncome = parseFloat(item.replace(",", "."));
              break;
            case 5:
              esDocument.taxDue = parseFloat(item.replace(",", "."));
              break;
            case 6:
              esDocument.advanceTax = parseFloat(item.replace(",", "."));
              break;
            case 7:
              esDocument.taxRefund = parseFloat(item.replace(",", "."));
              break;
            case 8:
              esDocument.residualTax = parseFloat(item.replace("\r", "").replace(",", "."));
              break;
            default:
              console.log("unexpected line item " + index + ": " + item);
          }
        });
        //console.log(esDocument);
        postDocumentToES(esDocument, context);
      });
    }
  });
}

/*
 * The AWS credentials are picked up from the environment.
 * They belong to the IAM role assigned to the Lambda function.
 * Since the ES requests are signed using these credentials,
 * make sure to apply a policy that permits ES domain operations
 * to the role.
 */
var creds = new AWS.EnvironmentCredentials('AWS');

/*
 * Add the given document to the ES domain.
 */
function postDocumentToES(doc, context) {
  es.index({
    index: esDomain.index,
    type: esDomain.doctype,
    body: doc
  }, function(error, response, status) {
    if (error) {
      console.log(error, error.stack);
    } else {
      ++docsPosted;
      if (docsTotal === docsPosted) {
        console.log("All docs posted: " + docsPosted);
        var responseData = {};
        RESPONSE.send(responseEvent, context, RESPONSE.SUCCESS, responseData);
      }
    }
  });
}

/* Lambda "main": Execution starts here */
exports.handler = function(event, context) {
    console.log('Received event: ', JSON.stringify(event, null, 2));
    es = require('elasticsearch').Client({
      host: event.ResourceProperties.ESEndpoint, //from cloudformation custom resource properties
      //log: 'trace',
      connectionClass: require('http-aws-es'),
      amazonES: {
        region: event.ResourceProperties.Region,
        credentials: creds
      }
    });
    responseEvent = event;
    listTaxData(event.ResourceProperties.Bucket, event.ResourceProperties.Prefix, context);
}
