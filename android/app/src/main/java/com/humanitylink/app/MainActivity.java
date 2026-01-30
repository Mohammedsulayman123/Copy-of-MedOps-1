package com.humanitylink.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.telephony.SmsMessage;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private SMSReceiver smsReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Request SMS Permissions at runtime
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (checkSelfPermission(Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS}, 1);
            }
        }

        // Register the SMS Receiver
        smsReceiver = new SMSReceiver();
        registerReceiver(smsReceiver, new IntentFilter("android.provider.Telephony.SMS_RECEIVED"));
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (smsReceiver != null) {
            unregisterReceiver(smsReceiver);
        }
    }

    // Inner class to handle incoming SMS
    private class SMSReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent.getAction() != null && intent.getAction().equals("android.provider.Telephony.SMS_RECEIVED")) {
                Bundle bundle = intent.getExtras();
                if (bundle != null) {
                    // Describe the PDU (Protocol Data Unit)
                    Object[] pdus = (Object[]) bundle.get("pdus");
                    String format = bundle.getString("format"); 
                    
                    if (pdus != null) {
                        for (Object pdu : pdus) {
                            SmsMessage sms;
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                sms = SmsMessage.createFromPdu((byte[]) pdu, format);
                            } else {
                                sms = SmsMessage.createFromPdu((byte[]) pdu);
                            }

                            String body = sms.getMessageBody();
                            String sender = sms.getOriginatingAddress();

                            // Filter for WASH messages
                            if (body != null && body.toUpperCase().startsWith("WASH")) {
                                String cleanBody = body.replace("'", "").replace("\n", " ").replace("\r", " ").replace("\"", ""); // Sanitize for JS
                                
                                // Send to the Web Layer (React)
                                if (getBridge() != null) {
                                    getBridge().eval("window.dispatchEvent(new CustomEvent('smsReceived', { detail: { body: '" + cleanBody + "', sender: '" + sender + "' } }));", null);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
