/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
package org.igov.io.web;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import org.igov.debug.Log;
import static org.igov.debug.Log.oLogBig_Web;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.FormHttpMessageConverter;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.ResourceHttpMessageConverter;
import org.springframework.http.converter.StringHttpMessageConverter;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

/**
 *
 * @author bw
 */
public class HttpEntityCover {
    
    static final transient Logger oLog = LoggerFactory.getLogger(HttpEntityCover.class);
    
    private HttpHeaders oHttpHeaders = new HttpHeaders();
    private String sURL = null;
    private MultiValueMap<String, Object> mParamObject = null;
    private MultiValueMap<String, ByteArrayResource> mParamByteArray = null;
    
    
    private ResponseEntity<String> osResponseEntity = null;
            
    public HttpEntityCover(String sURL){
        this.sURL = sURL;
    }

    public HttpEntityCover _Header(HttpHeaders oHttpHeaders){
        this.oHttpHeaders = oHttpHeaders;
        return this;
    }

    public HttpEntityCover _Data(MultiValueMap<String, Object> mParamObject){
        this.mParamObject = mParamObject;
        return this;
    }

    public HttpEntityCover _DataArray(MultiValueMap<String, ByteArrayResource> mParamByteArray){
        this.mParamByteArray = mParamByteArray;
        return this;
    }

    public String sReturn(){
        if(osResponseEntity==null){
            return null;
        }
        return osResponseEntity.getBody();
    }

    public Integer nStatus(){
        if(osResponseEntity==null){
            return null;
        }
        return osResponseEntity.getStatusCode().value();
    }

    public Boolean bStatusOk(){
        return nStatus()==200;
    }
    
    public HttpEntityCover _Send(){
        String sRequest = null;
        try{
            StringHttpMessageConverter oStringHttpMessageConverter = new StringHttpMessageConverter();
            HttpMessageConverter<Resource> oHttpMessageConverter = new ResourceHttpMessageConverter();
            FormHttpMessageConverter oFormHttpMessageConverter = new FormHttpMessageConverter();
            oFormHttpMessageConverter.addPartConverter(oHttpMessageConverter);

            RestTemplate oRestTemplate = new RestTemplate(
                    Arrays.asList(oStringHttpMessageConverter, oHttpMessageConverter, oFormHttpMessageConverter));

            
            //Let's construct attachemnts HTTP entities
            if (mParamByteArray != null) {
                Iterator<String> osIterator = mParamByteArray.keySet().iterator();
                for (int n = 0; osIterator.hasNext(); n++) {
                    String sFileName = osIterator.next();
                    HttpHeaders oHttpHeaders_Part = new HttpHeaders();
                    oHttpHeaders_Part.setContentType(new MediaType("application", "octet-stream", StandardCharsets.UTF_8));
                    //headers.add("Content-type","application/octet-stream;charset=utf-8");
                    //partHeaders.setContentType(MediaType.APPLICATION_OCTET_STREAM);
                    List<ByteArrayResource> aByteArray_Part = mParamByteArray.get(sFileName);
                    HttpEntity<ByteArrayResource> oByteArray_Part = new HttpEntity<ByteArrayResource>(aByteArray_Part.get(0), oHttpHeaders_Part); //HttpEntity<ByteArrayResource> bytesPart = new HttpEntity<ByteArrayResource>(bars.get(i), partHeaders);
                    oLog.info("!sFileName: {}", sFileName);
                    mParamObject.add(sFileName, oByteArray_Part);
                }
            }
            
            sRequest = mParamObject.toString();
            
            HttpEntity oHttpEntity = new HttpEntity(mParamObject, oHttpHeaders);
            osResponseEntity = oRestTemplate.postForEntity(sURL, oHttpEntity, String.class);
            //return getUniResponse(osResponseEntity.getBody());
            //Integer nStatus = nReturn();
            
            if(nStatus()!=200){
                new Log(this.getClass())
                        ._Head("[post]:nStatus!=200")
                        ._Status(Log.LogStatus.ERROR)
                        //._StatusHTTP(nReturn())
                        ._Param("nReturn", nStatus())
                        ._Param("sURL", sURL)
                        //._Param("saParam", saParam)
                        ._SendThrow()
                        ;
            }
            oLog.info("[_Send](nStatus="+nStatus()+",sURL="+sURL+",sRequest="+sRequest+",sReturn.length()="+(sReturn()!=null?sReturn().length():null)+"):Finished!");
            oLogBig_Web.info("[post](nStatus="+nStatus()+",sURL="+sURL+",sRequest="+sRequest+",osReturn="+sReturn()+"):Finished!");
            //return osReturn.toString();
        }catch(Exception oException){
            if(nStatus()!=200){
                new Log(this.getClass(), oException)
                        ._Head("[post]:")
                        ._Status(Log.LogStatus.ERROR)
                        //._StatusHTTP(nStatus)
                        ._Param("nStatus", nStatus())
                        ._Param("sURL", sURL)
                        //._Param("saParam", saParam)
                        ._SendThrow()
                        ;
            }
            oLog.error("[_Send](nStatus="+nStatus()+",sURL="+sURL+",sRequest="+sRequest+"):",oException);
            throw oException; //return null;
        }        
        return this;
    }
    
    
    
}
