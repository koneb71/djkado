package com.djkado.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local (non-npm) plugins are NOT in capacitor.plugins.json, so they must be
        // registered here, BEFORE super.onCreate() builds the Bridge.
        registerPlugin(FilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
