// mobile/App.js
import React, { useEffect, useState } from 'react';
import { Text, View, Button, FlatList, TextInput, TouchableOpacity, SafeAreaView } from 'react-native';
import axios from 'axios';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const API = 'C:\Users\dayac\Documents\GitHub\ai-stock-app\backend\backend'; // change to your backend

function Login({ navigation, setToken }){
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  async function doLogin(){
    const r = await axios.post(`${API}/login`, { email, password });
    setToken(r.data.token);
  }
  return (
    <View style={{flex:1,padding:20,justifyContent:'center'}}>
      <TextInput placeholder="email" value={email} onChangeText={setEmail} style={{borderWidth:1, padding:8, marginBottom:8}} />
      <TextInput placeholder="password" value={password} onChangeText={setPassword} secureTextEntry style={{borderWidth:1, padding:8, marginBottom:12}} />
      <Button title="Login" onPress={doLogin} />
      <View style={{height:8}} />
      <Button title="Register" onPress={async ()=>{ await axios.post(`${API}/register`, { email, password }); alert('registered — login'); }} />
    </View>
  );
}

function Dashboard({ token }){
  const [positions, setPositions] = useState([]);
  const [picks, setPicks] = useState([]);
  async function loadPositions(){
    const r = await axios.get(`${API}/positions`, { headers: { Authorization: `Bearer ${token}` }});
    setPositions(r.data.positions || []);
  }
  async function loadPicks(){
    const r = await axios.get(`${API}/ai-picks`, { headers: { Authorization: `Bearer ${token}` }});
    setPicks(r.data.picks || []);
  }
  useEffect(()=>{ loadPositions(); loadPicks(); }, []);

  return (
    <SafeAreaView style={{flex:1}}>
      <Text style={{fontSize:18, padding:12}}>Owned Stocks</Text>
      <FlatList data={positions} keyExtractor={i=>i.symbol} renderItem={({item})=>(
        <View style={{padding:12, borderBottomWidth:1}}><Text>{item.symbol} — {item.qty} @ {item.avg_entry_price}</Text></View>
      )} />
      <Text style={{fontSize:18, padding:12}}>AI Picks</Text>
      <FlatList data={picks} keyExtractor={i=>i.symbol} renderItem={({item})=>(
        <View style={{padding:12, borderBottomWidth:1}}><Text>{item.symbol} — score {item.score.toFixed(2)}</Text></View>
      )} />
    </SafeAreaView>
  );
}

const Stack = createNativeStackNavigator();

export default function App(){
  const [token,setToken] = useState(null);

  // push token
  useEffect(()=>{
    registerForPushNotificationsAsync().then(tokenPush => {
      if(tokenPush && token) axios.post(`${API}/expo-token`, { token: tokenPush }, { headers: { Authorization: `Bearer ${token}` }});
    });
  }, [token]);

  if(!token) return <Login setToken={setToken} />;
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Dashboard">
          {props => <Dashboard {...props} token={token} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// helper: get expo push token
async function registerForPushNotificationsAsync() {
  let token;
  if (Device.isDevice) {
    const statusObj = await Notifications.getPermissionsAsync();
    let finalStatus = statusObj.status;
    if (finalStatus !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      finalStatus = req.status;
    }
    if (finalStatus !== 'granted') {
      alert('Failed to get push token for push notification!');
      return;
    }
    token = (await Notifications.getExpoPushTokenAsync()).data;
    return token;
  } else {
    alert('Must use physical device for push notifications');
    return null;
  }
}
