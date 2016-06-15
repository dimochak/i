var url = require('url')
  , request = require('request')
  , fs = require('fs')
  , FormData = require('form-data')
  , config = require('../../config/environment')
  , bankIDService = require('../../auth/bankid/bankid.service.js')
  , _ = require('lodash')
  , StringDecoder = require('string_decoder').StringDecoder
  , async = require('async')
  , formTemplate = require('./form.template')
  , uploadFileService = require('../uploadfile/uploadfile.service')
  , activiti = require('../../components/activiti')
  , region = require('../../components/region')
  , errors = require('../../components/errors');

module.exports.index = function (req, res) {
  var sHost = req.region.sHost;
  var sID_BP_Versioned = req.query.sID_BP_Versioned;

  var callback = function (error, response, body) {
    res.send(body);
    res.end();
  };

  activiti.get('/service/form/form-data', {processDefinitionId: sID_BP_Versioned}, callback, sHost);
};

module.exports.submit = function (req, res) {
  var formData = req.body;
  var nID_Subject = req.session.subject.nID;
  var sHost = req.region.sHost;

  var properties = [];
  for (var id in formData.params) {
    if (formData.params.hasOwnProperty(id)) {
      var value = formData.params[id];
      if (id === 'nID_Subject') {
        value = nID_Subject;
      }
      if (id === 'sID_UA' && formData.sID_UA_Common !== null) {
        value = formData.sID_UA_Common;
      } else if (id === 'sID_UA') {
        value = formData.sID_UA;
      }

      properties.push({
        id: id,
        value: value
      });
    }
  }

  var callback = function (error, response, body) {
    res.send(body);
    res.end();
  };

  var qs = {
    nID_Subject: nID_Subject,
    nID_Service: formData.nID_Service,
    nID_Region: formData.nID_Region,
    sID_UA: formData.sID_UA
  };

  var body = {
    processDefinitionId: formData.processDefinitionId,
    businessKey: "key",
    nID_Subject: nID_Subject,
    properties: properties
  };

  activiti.post('/service/form/form-data', qs, body, callback, sHost);
};

module.exports.scanUpload = function (req, res) {
  var sHost = req.region.sHost;
  var accessToken = req.session.access.accessToken;
  var data = req.body;

  var sURL = sHost + '/service/object/file/upload_file_to_redis';
  console.log("[scanUpload]:sURL=" + sURL);

  var uploadURL = sURL; //data.url
  var documentScans = data.scanFields;
  console.log("[scanUpload]:data.scanFields=" + data.scanFields);

  var uploadResults = [];
  var uploadScan = function (documentScan, callback) {
    bankIDService.scanContentRequest(documentScan.scan.type, documentScan.scan.link, accessToken, function (error, buffer) {
      if (error) {
        callback(error);
      } else {
        var form = new FormData();
        form.append('file', buffer, {
          filename: documentScan.scan.type + '.' + documentScan.scan.extension
        });

        var requestOptionsForUploadContent = {
          url: uploadURL,
          auth: getAuth(),
          headers: form.getHeaders()
        };

        pipeFormDataToRequest(form, requestOptionsForUploadContent, function (result) {
          console.log('[scanUpload]:scan redis id ' + result.data);
          uploadResults.push({
            fileID: result.data,
            scanField: documentScan
          });
          callback();
        });
      }
    });
  };

  async.forEach(documentScans, function (documentScan, callback) {
    uploadScan(documentScan, callback);
  }, function (error) {
    if (error) {
      res.status(500).send(error);
    } else {
      res.send(uploadResults);
    }
  });

};

module.exports.signCheck = function (req, res) {
  var fileID = req.query.fileID;
  var sHost = req.region.sHost;

  var sURL = sHost + '/';
  console.log("sURL=" + sURL);

  if (!fileID) {
    res.status(400).send(errors.createError(errors.codes.INPUT_PARAMETER_ERROR, 'fileID should be specified'));
    return;
  }

  if (!sURL) {
    res.status(400).send(errors.createError(errors.codes.INPUT_PARAMETER_ERROR, 'sURL should be specified'));
    return;
  }

  var reqParams = activiti.buildRequest(req, 'service/object/file/check_file_from_redis_sign', {
    sID_File_Redis: fileID
  }, sURL);
  _.extend(reqParams, {json: true});

  request(reqParams, function (error, response, body) {
    if (error) {
      error = errors.createError(errors.codes.EXTERNAL_SERVICE_ERROR, 'Error while checking file\'s sign', error);
      res.status(500).send(error);
      return;
    }

    if (body.code && body.code === 'SYSTEM_ERR') {
      error = errors.createError(errors.codes.EXTERNAL_SERVICE_ERROR, body.message, body);
      res.status(500).send(error);
      return;
    }

    if (body.customer && body.customer.signatureData) {
      res.status(200).send(body.customer.signatureData);
    } else {
      res.status(200).send({});
    }
  });
};

module.exports.signForm = function (req, res) {
  var oServiceDataNID = req.query.oServiceDataNID;
  var sName = req.query.sName;
  var nID_Server = req.query.nID_Server;
  var formID = req.session.formID;
  var sHost = req.region.sHost;
  var sURL = sHost + '/';

  if (!formID) {
    res.status(400).send({error: 'formID should be specified'});
  }

  if (!oServiceDataNID && !sURL) {
    res.status(400).send({error: 'Either sURL or oServiceDataNID should be specified'});
    return;
  }

  var callbackURL = url.resolve(originalURL(req, {}), '/api/process-form/sign/callback?nID_Server=' + nID_Server);
  function findFileFields(formData) {
    var fileFields = formData.activitiForm.formProperties.filter(function (property) {
      return property.type === 'file';
    });
    fileFields.forEach(function (fileField) {
      if (formData.formData.params[fileField.id]) {
        fileField.value = formData.formData.params[fileField.id];
      }
    });

    fileFields = fileFields.filter(function (fileField) {
      return fileField.value;
    });

    return fileFields;
  }

  function createHtml(data, callback) {
    var formData = data.formData;

    var templateData = {
      formProperties: data.activitiForm.formProperties,
      processName: sName,
      businessKey: data.businessKey,
      creationDate: '' + new Date()
    };

    var patternFileName = null;

    templateData.formProperties.forEach(function (item) {
      var value = formData.params[item.id];
      if (value) {
        item.value = value;
      }
    });

    for (var key in formData.params) {
      if (formData.params.hasOwnProperty(key) && key.indexOf('PrintFormAutoSign_') === 0)
        patternFileName = formData.params[key];
    }

    if (patternFileName) {
      var reqParams = activiti.buildRequest(req, 'service/object/file/getPatternFile', {sPathFile: patternFileName.replace(/^pattern\//, '')}, sURL);
      request(reqParams, function (error, response, body) {
        for (var key in formData.params) {
          if (formData.params.hasOwnProperty(key)) {
            body = body.replace('[' + key + ']', formData.params[key]);
          }
        }
        callback(body);
      });
    } else {
      callback(formTemplate.createHtml(templateData));
    }
  }

  function getFormAsync(callbackAsync) {
    loadForm(formID, sURL, function (error, response, body) {
      if (error) {
        callbackAsync(error, null);
      } else {
        callbackAsync(null, body);
      }
    });
  }

  var objectsToSign = [];

  function getHtmlAsync(formData, callbackAsync) {
    createHtml(formData, function (formToUpload) {
      objectsToSign.push({
        name: 'file',
        text: formToUpload,
        options: {
          contentType: 'text/html'
        }
      });
      callbackAsync(null, formData);
    });
  }

  function getFileBuffersAsync(formData, callbackAsync) {
    var filesToSign = [];
    async.forEach(findFileFields(formData), function (fileField, callbackEach) {
      uploadFileService.downloadBuffer(fileField.value, function (error, response, buffer) {
        filesToSign.push({
          name: fileField.id,
          options: {
            filename: formData.formData.files[fileField.id]
          },
          buffer: buffer
        });
        callbackEach();
      }, sHost)
    }, function (error) {
      if (error) {
        callbackAsync(error, null);
      } else {
        objectsToSign = objectsToSign.concat(filesToSign);
        callbackAsync(null, formData);
      }
    });
  }

  function signFilesAsync(formData, callbackAsync) {
    var accessToken = req.session.access.accessToken;
    bankIDService.signFiles(accessToken, callbackURL, objectsToSign, function (error, result) {
      if (error) {
        callbackAsync(error, null);
      } else {
        callbackAsync(null, result)
      }
    });
  }

  async.waterfall([
    getFormAsync,
    getHtmlAsync,
    getFileBuffersAsync,
    signFilesAsync
  ], function (error, result) {
    if (error) {
      res.status(500).send(error);
    } else {
      res.redirect(result.desc);
    }
  });
};

module.exports.signFormCallback = function (req, res) {
  var sHost = req.region.sHost;
  var sURL = sHost + '/';
  var formID = req.session.formID;
  var codeValue = req.query.code;
  var accessToken = req.session.access.accessToken;

  if (!codeValue) {
    codeValue = req.query['amp;code'];
  }

  //TODO we can get multiple files in one zip file or like multipart
  //TODO parse result in case if multiple files
  //TODO get signed html file and leave it as it is
  //TODO get each signed attached file and replace id from initial form
  //TODO to new uploaded to redis signed files
  
  async.waterfall([
    function (callback) {
      loadForm(formID, sURL, function (error, response, body) {
        if (error) {
          callback(error, null);
        } else {
          callback(null, body);
        }
      });
    },
    function (formData, callback) {
      bankIDService.downloadSignedContent(accessToken, codeValue, function (error, result) {
        callback(error, {signedContent : result, formData: formData});
      });
    },
    function (result, callback) {
      uploadFileService.upload([{
        name: 'file',
        options: {
          filename: result.signedContent.fileName
        },
        buffer: result.signedContent.buffer
      }], function (error, response, body) {
        if (!body) {
          callback(errors.createExternalServiceError('Can\'t save signed content. Unknown error', error), null);
        } else if (body.code && body.message) {
          callback(errors.createExternalServiceError('Can\'t save content. ' + body.message, body), null);
        } else if (body.fileID) {
          result.signedFileID = body.fileID;
          callback(null, result);
        }
      }, sHost);
    }
  ], function (err, result) {
    if (err) {
      res.redirect(result.formData.restoreFormUrl
        + '?formID=' + formID
        + '&error=' + JSON.stringify(err));
    } else {
      res.redirect(result.formData.restoreFormUrl
        + '?formID=' + formID
        + '&signedFileID=' + result.signedFileID);
    }
  });
};

module.exports.saveForm = function (req, res) {
  var sHost = req.region.sHost;
  var data = req.body;

  uploadFileService.upload([{
    name: 'file',
    options: {
      filename: 'formData.json'
    },
    text: JSON.stringify(data)
  }], function (error, response, body) {
    if (!body) {
      res.status(500).send(errors.createExternalServiceError('Can\'t save form. Unknown error', error));
    } else if (body.code && body.message) {
      res.status(500).send(errors.createExternalServiceError('Can\'t save form. ' + body.message, body));
    } else if (body.fileID) {
      req.session.formID = body.fileID;
      res.send({formID: body.fileID});
    }
  }, sHost);
};

module.exports.loadForm = function (req, res) {
  var formID = req.query.formID;
  var sHost = req.region.sHost;
  var sURL = sHost + '/';

  var callback = function (error, response, body) {
    if (error) {
      res.status(400).send(error);
    } else {
      res.send(body);
    }
  };

  loadForm(formID, sURL, callback);
};

function loadForm(formID, sURL, callback) {
  var downloadURL = sURL + 'service/object/file/download_file_from_redis_bytes';
  request.get({
    url: downloadURL,
    auth: getAuth(),
    qs: {
      key: formID
    },
    json: true
  }, callback);
}

function pipeFormDataToRequest(form, requestOptionsForUploadContent, callback) {
  var decoder = new StringDecoder('utf8');
  var result = {};
  form.pipe(request.post(requestOptionsForUploadContent))
    .on('response', function (response) {
      result.statusCode = response.statusCode;
    }).on('data', function (chunk) {
    if (result.data) {
      result.data += decoder.write(chunk);
    } else {
      result.data = decoder.write(chunk);
    }
  }).on('end', function () {
    callback(result);
  });
}

var originalURL = function (req, options) {
  options = options || {};
  var app = req.app;
  if (app && app.get && app.get('trust proxy')) {
    options.proxy = true;
  }
  var trustProxy = options.proxy;

  var proto = (req.headers['x-forwarded-proto'] || '').toLowerCase()
    , tls = req.connection.encrypted || (trustProxy && 'https' == proto.split(/\s*,\s*/)[0])
    , host = (trustProxy && req.headers['x-forwarded-host']) || req.headers.host
    , protocol = tls ? 'https' : 'http'
    , path = req.url || '';
  return protocol + '://' + host + path;
};

function getOptions() {
  var config = require('../../config/environment');
  //var config = require('../../config');

  var oConfigServerExternal = config.activiti;

  return {
    protocol: oConfigServerExternal.protocol,
    hostname: oConfigServerExternal.hostname,
    port: oConfigServerExternal.port,
    path: oConfigServerExternal.path,
    username: oConfigServerExternal.username,
    password: oConfigServerExternal.password
  };
}

function getAuth() {
  var options = getOptions();
  return {
    'username': options.username,
    'password': options.password
  };
}
