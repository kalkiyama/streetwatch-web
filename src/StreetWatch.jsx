import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, MapPin, Radio, Plane, X, Globe, Crosshair, ExternalLink,
  Car, Ship, CloudSun, Camera, PawPrint, Satellite, SignalHigh,
  Radar, Wifi, WifiOff, Star, Navigation,
} from "lucide-react";
import Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";

// ---------------------------------------------------------------------------
//  PALETTE — traffic-operations console. Colors inline (no Tailwind compiler);
//  layout/responsive via Tailwind core utilities.
// ---------------------------------------------------------------------------
const C = {
  ink: "#0E1116", panel: "#161A21", panel2: "#1C212B", line: "#2A303C",
  text: "#E8EAED", dim: "#8A94A3", faint: "#5A6473", amber: "#F6A821", cyan: "#5AC8FA",
};

// Public layers — every source is published for public viewing.
const LAYERS = {
  traffic:  { label: "Traffic",  icon: Car,       color: "#F6A821", camera: true,  desc: "Public DOT / motorway road cameras." },
  aviation: { label: "Aviation", icon: Plane,     color: "#5AC8FA", camera: false, desc: "Open ADS-B live flight & airport activity." },
  marine:   { label: "Marine",   icon: Ship,      color: "#2DD4BF", camera: false, desc: "Open AIS live ship positions & ports." },
  weather:  { label: "Earth",    icon: CloudSun,  color: "#A78BFA", camera: false, desc: "Public satellite & weather imagery." },
  webcam:   { label: "Webcams",  icon: Camera,    color: "#37C46A", camera: true,  desc: "Published public webcams — squares, beaches, landmarks." },
  wildlife: { label: "Wildlife", icon: PawPrint,  color: "#A3E635", camera: true,  desc: "Public conservation & nature livestreams." },
  space:    { label: "Space",    icon: Satellite, color: "#F472B6", camera: false, desc: "Live orbital feeds & tracking." },
};
const layerKeys = Object.keys(LAYERS);

// Representative anchors. In production each layer enumerates thousands of
// entries from its source's public API/directory; these prove the structure.
const CATALOG = [
  { id:"GNT-A", name:"Vijayawada–Guntur (VGA) airspace", layer:"aviation", city:"Vijayawada", region:"Andhra Pradesh", country:"India", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:16.530, lng:80.797 },
  { id:"GNT-T", name:"Guntur roads (NH-16)", layer:"traffic", city:"Guntur", region:"Andhra Pradesh", country:"India", continent:"Asia", src:"TrafficVision", url:"https://trafficvision.live/", lat:16.306, lng:80.436 },
  { id:"TRIN-0", name:"Pune roads", layer:"traffic", city:"Pune", region:"Maharashtra", country:"India", continent:"Asia", src:"WeatherBug", url:"https://www.weatherbug.com/traffic-cam/pune-maharashtra-in", lat:18.52, lng:73.86 },
  { id:"TRIN-1", name:"Hyderabad ORR", layer:"traffic", city:"Hyderabad", region:"Telangana", country:"India", continent:"Asia", src:"WeatherBug", url:"https://www.weatherbug.com/traffic-cam/hyderabad-andhra-pradesh-in", lat:17.39, lng:78.49 },
  { id:"TRIN-2", name:"Chennai roads", layer:"traffic", city:"Chennai", region:"Tamil Nadu", country:"India", continent:"Asia", src:"WeatherBug", url:"https://www.weatherbug.com/traffic-cam/chennai-tamil-nadu-in", lat:13.08, lng:80.27 },
  { id:"TRIN-3", name:"Kolkata roads", layer:"traffic", city:"Kolkata", region:"West Bengal", country:"India", continent:"Asia", src:"WeatherBug", url:"https://www.weatherbug.com/traffic-cam/kolkata-bengal-in", lat:22.57, lng:88.36 },
  { id:"TRIN-4", name:"Ahmedabad roads", layer:"traffic", city:"Ahmedabad", region:"Gujarat", country:"India", continent:"Asia", src:"TrafficVision", url:"https://trafficvision.live/", lat:23.02, lng:72.57 },
  { id:"TRIN-5", name:"Jaipur roads", layer:"traffic", city:"Jaipur", region:"Rajasthan", country:"India", continent:"Asia", src:"TrafficVision", url:"https://trafficvision.live/", lat:26.92, lng:75.79 },
  { id:"TRIN-6", name:"Chandigarh roads", layer:"traffic", city:"Chandigarh", region:"Chandigarh", country:"India", continent:"Asia", src:"TrafficVision", url:"https://trafficvision.live/", lat:30.73, lng:76.78 },
  { id:"TRIN-7", name:"Kochi roads", layer:"traffic", city:"Kochi", region:"Kerala", country:"India", continent:"Asia", src:"TrafficVision", url:"https://trafficvision.live/", lat:9.93, lng:76.27 },
  { id:"TRIN-8", name:"Lucknow roads", layer:"traffic", city:"Lucknow", region:"Uttar Pradesh", country:"India", continent:"Asia", src:"TrafficVision", url:"https://trafficvision.live/", lat:26.85, lng:80.95 },
  { id:"TRIN-9", name:"Surat roads", layer:"traffic", city:"Surat", region:"Gujarat", country:"India", continent:"Asia", src:"TrafficVision", url:"https://trafficvision.live/", lat:21.17, lng:72.83 },
  { id:"TRIN-10", name:"Mumbai–Pune Expressway", layer:"traffic", city:"Lonavala", region:"Maharashtra", country:"India", continent:"Asia", src:"TrafficVision", url:"https://trafficvision.live/", lat:18.75, lng:73.4 },
  { id:"TRIN-11", name:"Yamuna Expressway", layer:"traffic", city:"Greater Noida", region:"Uttar Pradesh", country:"India", continent:"Asia", src:"TrafficVision", url:"https://trafficvision.live/", lat:27.6, lng:77.9 },
  { id:"TRIN-12", name:"Bengaluru–Mysuru Expressway", layer:"traffic", city:"Mandya", region:"Karnataka", country:"India", continent:"Asia", src:"TrafficVision", url:"https://trafficvision.live/", lat:12.6, lng:77 },
  { id:"TRIN-13", name:"India national highways", layer:"traffic", city:"National", region:"—", country:"India", continent:"Asia", src:"OpenCCTV", url:"https://opencctv.org/livetraffic/india", lat:22, lng:79 },
  { id:"AV2-0", name:"Rio de Janeiro (GIG) airspace", layer:"aviation", city:"Rio de Janeiro", region:"RJ", country:"Brazil", continent:"South America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:-22.81, lng:-43.25 },
  { id:"AV2-1", name:"Brasília (BSB) airspace", layer:"aviation", city:"Brasília", region:"DF", country:"Brazil", continent:"South America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:-15.869, lng:-47.921 },
  { id:"AV2-2", name:"Medellín (MDE) airspace", layer:"aviation", city:"Medellín", region:"Antioquia", country:"Colombia", continent:"South America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:6.164, lng:-75.423 },
  { id:"AV2-3", name:"Quito (UIO) airspace", layer:"aviation", city:"Quito", region:"Pichincha", country:"Ecuador", continent:"South America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:-0.129, lng:-78.357 },
  { id:"AV2-4", name:"Caracas (CCS) airspace", layer:"aviation", city:"Caracas", region:"Capital", country:"Venezuela", continent:"South America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:10.601, lng:-66.991 },
  { id:"AV2-5", name:"Montevideo (MVD) airspace", layer:"aviation", city:"Montevideo", region:"Montevideo", country:"Uruguay", continent:"South America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:-34.838, lng:-56.03 },
  { id:"AV2-6", name:"La Paz (LPB) airspace", layer:"aviation", city:"La Paz", region:"La Paz", country:"Bolivia", continent:"South America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:-16.513, lng:-68.192 },
  { id:"AV2-7", name:"Guayaquil (GYE) airspace", layer:"aviation", city:"Guayaquil", region:"Guayas", country:"Ecuador", continent:"South America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:-2.157, lng:-79.884 },
  { id:"AV2-8", name:"Asunción (ASU) airspace", layer:"aviation", city:"Asunción", region:"Central", country:"Paraguay", continent:"South America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:-25.24, lng:-57.519 },
  { id:"AV2-9", name:"Bengaluru (BLR) airspace", layer:"aviation", city:"Bengaluru", region:"Karnataka", country:"India", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:13.199, lng:77.71 },
  { id:"AV2-10", name:"Chennai (MAA) airspace", layer:"aviation", city:"Chennai", region:"Tamil Nadu", country:"India", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:12.994, lng:80.171 },
  { id:"AV2-11", name:"Kolkata (CCU) airspace", layer:"aviation", city:"Kolkata", region:"West Bengal", country:"India", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:22.654, lng:88.447 },
  { id:"AV2-12", name:"Hyderabad (HYD) airspace", layer:"aviation", city:"Hyderabad", region:"Telangana", country:"India", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:17.24, lng:78.429 },
  { id:"AV2-13", name:"Karachi (KHI) airspace", layer:"aviation", city:"Karachi", region:"Sindh", country:"Pakistan", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:24.906, lng:67.161 },
  { id:"AV2-14", name:"Lahore (LHE) airspace", layer:"aviation", city:"Lahore", region:"Punjab", country:"Pakistan", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:31.521, lng:74.404 },
  { id:"AV2-15", name:"Islamabad (ISB) airspace", layer:"aviation", city:"Islamabad", region:"ICT", country:"Pakistan", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:33.549, lng:72.826 },
  { id:"AV2-16", name:"Dhaka (DAC) airspace", layer:"aviation", city:"Dhaka", region:"Dhaka", country:"Bangladesh", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:23.843, lng:90.398 },
  { id:"AV2-17", name:"Colombo (CMB) airspace", layer:"aviation", city:"Colombo", region:"Western", country:"Sri Lanka", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:7.18, lng:79.884 },
  { id:"AV2-18", name:"Kathmandu (KTM) airspace", layer:"aviation", city:"Kathmandu", region:"Bagmati", country:"Nepal", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:27.696, lng:85.359 },
  { id:"AV2-19", name:"Abu Dhabi (AUH) airspace", layer:"aviation", city:"Abu Dhabi", region:"Abu Dhabi", country:"UAE", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:24.443, lng:54.651 },
  { id:"AV2-20", name:"Jeddah (JED) airspace", layer:"aviation", city:"Jeddah", region:"Makkah", country:"Saudi Arabia", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:21.68, lng:39.157 },
  { id:"AV2-21", name:"Riyadh (RUH) airspace", layer:"aviation", city:"Riyadh", region:"Riyadh", country:"Saudi Arabia", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:24.958, lng:46.699 },
  { id:"AV2-22", name:"Kuwait City (KWI) airspace", layer:"aviation", city:"Kuwait City", region:"Al Asimah", country:"Kuwait", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:29.227, lng:47.969 },
  { id:"AV2-23", name:"Muscat (MCT) airspace", layer:"aviation", city:"Muscat", region:"Muscat", country:"Oman", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:23.593, lng:58.284 },
  { id:"AV2-24", name:"Bahrain (BAH) airspace", layer:"aviation", city:"Manama", region:"Capital", country:"Bahrain", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:26.271, lng:50.634 },
  { id:"AV2-25", name:"Tehran (IKA) airspace", layer:"aviation", city:"Tehran", region:"Tehran", country:"Iran", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:35.416, lng:51.152 },
  { id:"AV2-26", name:"Amman (AMM) airspace", layer:"aviation", city:"Amman", region:"Amman", country:"Jordan", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:31.723, lng:36.01 },
  { id:"AV2-27", name:"Beirut (BEY) airspace", layer:"aviation", city:"Beirut", region:"Beirut", country:"Lebanon", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:33.821, lng:35.488 },
  { id:"AV2-28", name:"Tel Aviv (TLV) airspace", layer:"aviation", city:"Tel Aviv", region:"Tel Aviv", country:"Israel", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:32.011, lng:34.887 },
  { id:"AV2-29", name:"Addis Ababa (ADD) airspace", layer:"aviation", city:"Addis Ababa", region:"Addis Ababa", country:"Ethiopia", continent:"Africa", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:8.978, lng:38.799 },
  { id:"AV2-30", name:"Casablanca (CMN) airspace", layer:"aviation", city:"Casablanca", region:"Casablanca-Settat", country:"Morocco", continent:"Africa", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:33.367, lng:-7.59 },
  { id:"AV2-31", name:"Accra (ACC) airspace", layer:"aviation", city:"Accra", region:"Greater Accra", country:"Ghana", continent:"Africa", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:5.605, lng:-0.167 },
  { id:"AV2-32", name:"Dar es Salaam (DAR) airspace", layer:"aviation", city:"Dar es Salaam", region:"Dar es Salaam", country:"Tanzania", continent:"Africa", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:-6.878, lng:39.203 },
  { id:"AV2-33", name:"Algiers (ALG) airspace", layer:"aviation", city:"Algiers", region:"Algiers", country:"Algeria", continent:"Africa", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:36.691, lng:3.215 },
  { id:"AV2-34", name:"Dakar (DSS) airspace", layer:"aviation", city:"Dakar", region:"Dakar", country:"Senegal", continent:"Africa", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:14.671, lng:-17.073 },
  { id:"AV2-35", name:"Kuala Lumpur (KUL) airspace", layer:"aviation", city:"Kuala Lumpur", region:"Selangor", country:"Malaysia", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:2.745, lng:101.707 },
  { id:"AV2-36", name:"Jakarta (CGK) airspace", layer:"aviation", city:"Jakarta", region:"Jakarta", country:"Indonesia", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:-6.126, lng:106.656 },
  { id:"AV2-37", name:"Manila (MNL) airspace", layer:"aviation", city:"Manila", region:"Metro Manila", country:"Philippines", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:14.509, lng:121.019 },
  { id:"AV2-38", name:"Ho Chi Minh (SGN) airspace", layer:"aviation", city:"Ho Chi Minh City", region:"HCMC", country:"Vietnam", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:10.819, lng:106.652 },
  { id:"AV2-39", name:"Taipei (TPE) airspace", layer:"aviation", city:"Taipei", region:"Taoyuan", country:"Taiwan", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:25.077, lng:121.233 },
  { id:"AV2-40", name:"Lisbon (LIS) airspace", layer:"aviation", city:"Lisbon", region:"Lisbon", country:"Portugal", continent:"Europe", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:38.774, lng:-9.134 },
  { id:"AV2-41", name:"Athens (ATH) airspace", layer:"aviation", city:"Athens", region:"Attica", country:"Greece", continent:"Europe", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:37.936, lng:23.945 },
  { id:"MR2-0", name:"Port of Callao", layer:"marine", city:"Lima", region:"Callao", country:"Peru", continent:"South America", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:-12.05, lng:-77.15 },
  { id:"MR2-1", name:"Port of Cartagena", layer:"marine", city:"Cartagena", region:"Bolívar", country:"Colombia", continent:"South America", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:10.4, lng:-75.52 },
  { id:"MR2-2", name:"Buenos Aires Port", layer:"marine", city:"Buenos Aires", region:"Buenos Aires", country:"Argentina", continent:"South America", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:-34.6, lng:-58.36 },
  { id:"MR2-3", name:"Rio de Janeiro Port", layer:"marine", city:"Rio de Janeiro", region:"RJ", country:"Brazil", continent:"South America", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:-22.89, lng:-43.18 },
  { id:"MR2-4", name:"Port of Colombo", layer:"marine", city:"Colombo", region:"Western", country:"Sri Lanka", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:6.95, lng:79.84 },
  { id:"MR2-5", name:"Chennai Port", layer:"marine", city:"Chennai", region:"Tamil Nadu", country:"India", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:13.1, lng:80.3 },
  { id:"MR2-6", name:"Karachi Port", layer:"marine", city:"Karachi", region:"Sindh", country:"Pakistan", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:24.8, lng:66.98 },
  { id:"MR2-7", name:"Chittagong Port", layer:"marine", city:"Chittagong", region:"Chattogram", country:"Bangladesh", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:22.3, lng:91.8 },
  { id:"MR2-8", name:"Kochi Port", layer:"marine", city:"Kochi", region:"Kerala", country:"India", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:9.97, lng:76.26 },
  { id:"MR2-9", name:"Fujairah Anchorage", layer:"marine", city:"Fujairah", region:"Fujairah", country:"UAE", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:25.15, lng:56.4 },
  { id:"MR2-10", name:"Port of Dammam", layer:"marine", city:"Dammam", region:"Eastern", country:"Saudi Arabia", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:26.5, lng:50.2 },
  { id:"MR2-11", name:"Port of Salalah", layer:"marine", city:"Salalah", region:"Dhofar", country:"Oman", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:16.93, lng:54 },
  { id:"MR2-12", name:"Bandar Abbas", layer:"marine", city:"Bandar Abbas", region:"Hormozgan", country:"Iran", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:27.15, lng:56.2 },
  { id:"MR2-13", name:"Port of Durban", layer:"marine", city:"Durban", region:"KwaZulu-Natal", country:"South Africa", continent:"Africa", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:-29.87, lng:31.03 },
  { id:"MR2-14", name:"Port of Mombasa", layer:"marine", city:"Mombasa", region:"Mombasa", country:"Kenya", continent:"Africa", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:-4.05, lng:39.67 },
  { id:"MR2-15", name:"Tanger Med", layer:"marine", city:"Tangier", region:"Tanger-Tetouan", country:"Morocco", continent:"Africa", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:35.88, lng:-5.5 },
  { id:"MR2-16", name:"Port of Alexandria", layer:"marine", city:"Alexandria", region:"Alexandria", country:"Egypt", continent:"Africa", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:31.18, lng:29.87 },
  { id:"MR2-17", name:"Port Klang", layer:"marine", city:"Klang", region:"Selangor", country:"Malaysia", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:3, lng:101.39 },
  { id:"MR2-18", name:"Tanjung Priok", layer:"marine", city:"Jakarta", region:"Jakarta", country:"Indonesia", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:-6.1, lng:106.88 },
  { id:"MR2-19", name:"Laem Chabang", layer:"marine", city:"Chonburi", region:"Chonburi", country:"Thailand", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:13.08, lng:100.88 },
  { id:"WC2-0", name:"Ipanema Beach", layer:"webcam", city:"Rio de Janeiro", region:"RJ", country:"Brazil", continent:"South America", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:-22.98, lng:-43.2 },
  { id:"WC2-1", name:"Buenos Aires Obelisk", layer:"webcam", city:"Buenos Aires", region:"Buenos Aires", country:"Argentina", continent:"South America", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:-34.6, lng:-58.38 },
  { id:"WC2-2", name:"Cusco · Machu Picchu", layer:"webcam", city:"Cusco", region:"Cusco", country:"Peru", continent:"South America", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:-13.16, lng:-72.54 },
  { id:"WC2-3", name:"Cartagena Old Town", layer:"webcam", city:"Cartagena", region:"Bolívar", country:"Colombia", continent:"South America", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:10.42, lng:-75.55 },
  { id:"WC2-4", name:"Santiago", layer:"webcam", city:"Santiago", region:"RM", country:"Chile", continent:"South America", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:-33.44, lng:-70.65 },
  { id:"WC2-5", name:"Goa Beach", layer:"webcam", city:"Goa", region:"Goa", country:"India", continent:"Asia", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:15.55, lng:73.75 },
  { id:"WC2-6", name:"Colombo · Galle Face", layer:"webcam", city:"Colombo", region:"Western", country:"Sri Lanka", continent:"Asia", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:6.92, lng:79.84 },
  { id:"WC2-7", name:"Kathmandu Durbar Sq", layer:"webcam", city:"Kathmandu", region:"Bagmati", country:"Nepal", continent:"Asia", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:27.7, lng:85.31 },
  { id:"WC2-8", name:"Jaipur", layer:"webcam", city:"Jaipur", region:"Rajasthan", country:"India", continent:"Asia", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:26.92, lng:75.82 },
  { id:"WC2-9", name:"Burj Khalifa", layer:"webcam", city:"Dubai", region:"Dubai", country:"UAE", continent:"Asia", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:25.2, lng:55.27 },
  { id:"WC2-10", name:"Jerusalem · Old City", layer:"webcam", city:"Jerusalem", region:"Jerusalem", country:"Israel", continent:"Asia", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:31.78, lng:35.23 },
  { id:"WC2-11", name:"Petra", layer:"webcam", city:"Ma'an", region:"Ma'an", country:"Jordan", continent:"Asia", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:30.33, lng:35.44 },
  { id:"WC2-12", name:"Doha Corniche", layer:"webcam", city:"Doha", region:"Doha", country:"Qatar", continent:"Asia", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:25.29, lng:51.53 },
  { id:"WC2-13", name:"Marrakech", layer:"webcam", city:"Marrakech", region:"Marrakech-Safi", country:"Morocco", continent:"Africa", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:31.63, lng:-7.99 },
  { id:"WC2-14", name:"Giza Pyramids", layer:"webcam", city:"Cairo", region:"Giza", country:"Egypt", continent:"Africa", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:29.98, lng:31.13 },
  { id:"WC2-15", name:"Zanzibar Beach", layer:"webcam", city:"Zanzibar", region:"Zanzibar", country:"Tanzania", continent:"Africa", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:-6.16, lng:39.19 },
  { id:"WC2-16", name:"Victoria Falls", layer:"webcam", city:"Livingstone", region:"Southern", country:"Zambia", continent:"Africa", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:-17.92, lng:25.86 },
  { id:"WC2-17", name:"Eiffel Tower", layer:"webcam", city:"Paris", region:"Île-de-France", country:"France", continent:"Europe", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:48.86, lng:2.29 },
  { id:"WC2-18", name:"Colosseum", layer:"webcam", city:"Rome", region:"Lazio", country:"Italy", continent:"Europe", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:41.89, lng:12.49 },
  { id:"WC2-19", name:"Sydney Opera House", layer:"webcam", city:"Sydney", region:"NSW", country:"Australia", continent:"Oceania", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:-33.857, lng:151.215 },
  { id:"WC2-20", name:"Golden Gate", layer:"webcam", city:"San Francisco", region:"California", country:"United States", continent:"North America", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:37.81, lng:-122.47 },
  { id:"WC2-21", name:"Victoria Harbour", layer:"webcam", city:"Hong Kong", region:"—", country:"Hong Kong", continent:"Asia", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:22.29, lng:114.17 },
  { id:"WC2-22", name:"Marina Bay", layer:"webcam", city:"Singapore", region:"—", country:"Singapore", continent:"Asia", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:1.283, lng:103.86 },
  { id:"WL2-0", name:"Galápagos wildlife", layer:"wildlife", city:"Galápagos", region:"Galápagos", country:"Ecuador", continent:"South America", src:"Explore.org", url:"https://explore.org/livecams", lat:-0.74, lng:-90.31 },
  { id:"WL2-1", name:"Amazon rainforest", layer:"wildlife", city:"Tambopata", region:"Madre de Dios", country:"Peru", continent:"South America", src:"Explore.org", url:"https://explore.org/livecams", lat:-12.5, lng:-69.2 },
  { id:"WL2-2", name:"Tsavo elephants", layer:"wildlife", city:"Tsavo", region:"Coast", country:"Kenya", continent:"Africa", src:"Explore.org", url:"https://explore.org/livecams", lat:-2.98, lng:38.46 },
  { id:"WL2-3", name:"Kaziranga rhinos", layer:"wildlife", city:"Kaziranga", region:"Assam", country:"India", continent:"Asia", src:"Explore.org", url:"https://explore.org/livecams", lat:26.58, lng:93.17 },
  { id:"WL2-4", name:"San Diego Zoo", layer:"wildlife", city:"San Diego", region:"California", country:"United States", continent:"North America", src:"Explore.org", url:"https://explore.org/livecams", lat:32.735, lng:-117.15 },
  { id:"TR2-0", name:"São Paulo roads", layer:"traffic", city:"São Paulo", region:"SP", country:"Brazil", continent:"South America", src:"TrafficVision", url:"https://trafficvision.live/", lat:-23.55, lng:-46.63 },
  { id:"TR2-1", name:"Buenos Aires roads", layer:"traffic", city:"Buenos Aires", region:"Buenos Aires", country:"Argentina", continent:"South America", src:"TrafficVision", url:"https://trafficvision.live/", lat:-34.6, lng:-58.38 },
  { id:"TR2-2", name:"Bogotá roads", layer:"traffic", city:"Bogotá", region:"Bogotá", country:"Colombia", continent:"South America", src:"TrafficVision", url:"https://trafficvision.live/", lat:4.71, lng:-74.07 },
  { id:"TR2-3", name:"Lima roads", layer:"traffic", city:"Lima", region:"Lima", country:"Peru", continent:"South America", src:"TrafficVision", url:"https://trafficvision.live/", lat:-12.05, lng:-77.04 },
  { id:"TR2-4", name:"Mumbai roads", layer:"traffic", city:"Mumbai", region:"Maharashtra", country:"India", continent:"Asia", src:"WeatherBug", url:"https://www.weatherbug.com/traffic-cam/mumbai-maharashtra-in", lat:19.08, lng:72.88 },
  { id:"TR2-5", name:"Delhi roads", layer:"traffic", city:"New Delhi", region:"Delhi", country:"India", continent:"Asia", src:"WeatherBug", url:"https://www.weatherbug.com/traffic-cam/new-delhi-delhi-in", lat:28.61, lng:77.21 },
  { id:"TR2-6", name:"Bengaluru roads", layer:"traffic", city:"Bengaluru", region:"Karnataka", country:"India", continent:"Asia", src:"WeatherBug", url:"https://www.weatherbug.com/traffic-cam/bangalore-karnataka-in", lat:12.97, lng:77.59 },
  { id:"TR2-7", name:"Dubai roads", layer:"traffic", city:"Dubai", region:"Dubai", country:"UAE", continent:"Asia", src:"TrafficVision", url:"https://trafficvision.live/", lat:25.2, lng:55.27 },
  { id:"TR2-8", name:"Riyadh roads", layer:"traffic", city:"Riyadh", region:"Riyadh", country:"Saudi Arabia", continent:"Asia", src:"TrafficVision", url:"https://trafficvision.live/", lat:24.71, lng:46.68 },
  { id:"TR2-9", name:"Istanbul roads", layer:"traffic", city:"Istanbul", region:"Istanbul", country:"Türkiye", continent:"Europe", src:"TrafficVision", url:"https://trafficvision.live/", lat:41.01, lng:28.98 },
  { id:"TR2-10", name:"Cairo roads", layer:"traffic", city:"Cairo", region:"Cairo", country:"Egypt", continent:"Africa", src:"TrafficVision", url:"https://trafficvision.live/", lat:30.04, lng:31.24 },
  { id:"TR2-11", name:"New England 511", layer:"traffic", city:"Boston", region:"Massachusetts", country:"United States", continent:"North America", src:"New England 511", url:"https://newengland511.org/", lat:42.36, lng:-71.06 },
  { id:"AX-0", name:"Amsterdam (AMS) airspace", layer:"aviation", city:"Amsterdam", region:"North Holland", country:"Netherlands", continent:"Europe", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:52.3105, lng:4.7683 },
  { id:"AX-1", name:"Madrid (MAD) airspace", layer:"aviation", city:"Madrid", region:"Madrid", country:"Spain", continent:"Europe", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:40.4719, lng:-3.5626 },
  { id:"AX-2", name:"Rome (FCO) airspace", layer:"aviation", city:"Rome", region:"Lazio", country:"Italy", continent:"Europe", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:41.8003, lng:12.2389 },
  { id:"AX-3", name:"Istanbul (IST) airspace", layer:"aviation", city:"Istanbul", region:"Istanbul", country:"Türkiye", continent:"Europe", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:41.2753, lng:28.7519 },
  { id:"AX-4", name:"Munich (MUC) airspace", layer:"aviation", city:"Munich", region:"Bavaria", country:"Germany", continent:"Europe", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:48.3538, lng:11.7861 },
  { id:"AX-5", name:"Zurich (ZRH) airspace", layer:"aviation", city:"Zurich", region:"Zurich", country:"Switzerland", continent:"Europe", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:47.4647, lng:8.5492 },
  { id:"AX-6", name:"Dublin (DUB) airspace", layer:"aviation", city:"Dublin", region:"Leinster", country:"Ireland", continent:"Europe", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:53.4213, lng:-6.2701 },
  { id:"AX-7", name:"Barcelona (BCN) airspace", layer:"aviation", city:"Barcelona", region:"Catalonia", country:"Spain", continent:"Europe", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:41.2974, lng:2.0833 },
  { id:"AX-8", name:"Chicago (ORD) airspace", layer:"aviation", city:"Chicago", region:"Illinois", country:"United States", continent:"North America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:41.9742, lng:-87.9073 },
  { id:"AX-9", name:"Atlanta (ATL) airspace", layer:"aviation", city:"Atlanta", region:"Georgia", country:"United States", continent:"North America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:33.6407, lng:-84.4277 },
  { id:"AX-10", name:"Dallas–Fort Worth (DFW) airspace", layer:"aviation", city:"Dallas", region:"Texas", country:"United States", continent:"North America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:32.8998, lng:-97.0403 },
  { id:"AX-11", name:"Denver (DEN) airspace", layer:"aviation", city:"Denver", region:"Colorado", country:"United States", continent:"North America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:39.8561, lng:-104.6737 },
  { id:"AX-12", name:"San Francisco (SFO) airspace", layer:"aviation", city:"San Francisco", region:"California", country:"United States", continent:"North America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:37.6213, lng:-122.379 },
  { id:"AX-13", name:"Miami (MIA) airspace", layer:"aviation", city:"Miami", region:"Florida", country:"United States", continent:"North America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:25.7959, lng:-80.287 },
  { id:"AX-14", name:"Vancouver (YVR) airspace", layer:"aviation", city:"Vancouver", region:"BC", country:"Canada", continent:"North America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:49.1967, lng:-123.1815 },
  { id:"AX-15", name:"Mexico City (MEX) airspace", layer:"aviation", city:"Mexico City", region:"CDMX", country:"Mexico", continent:"North America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:19.4361, lng:-99.0719 },
  { id:"AX-16", name:"Seattle (SEA) airspace", layer:"aviation", city:"Seattle", region:"Washington", country:"United States", continent:"North America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:47.4502, lng:-122.3088 },
  { id:"AX-17", name:"Boston (BOS) airspace", layer:"aviation", city:"Boston", region:"Massachusetts", country:"United States", continent:"North America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:42.3656, lng:-71.0096 },
  { id:"AX-18", name:"Singapore (SIN) airspace", layer:"aviation", city:"Singapore", region:"—", country:"Singapore", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:1.3644, lng:103.9915 },
  { id:"AX-19", name:"Hong Kong (HKG) airspace", layer:"aviation", city:"Hong Kong", region:"—", country:"Hong Kong", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:22.308, lng:113.9185 },
  { id:"AX-20", name:"Seoul (ICN) airspace", layer:"aviation", city:"Seoul", region:"Incheon", country:"South Korea", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:37.4602, lng:126.4407 },
  { id:"AX-21", name:"Bangkok (BKK) airspace", layer:"aviation", city:"Bangkok", region:"Bangkok", country:"Thailand", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:13.69, lng:100.7501 },
  { id:"AX-22", name:"Beijing (PEK) airspace", layer:"aviation", city:"Beijing", region:"Beijing", country:"China", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:40.0799, lng:116.6031 },
  { id:"AX-23", name:"Shanghai (PVG) airspace", layer:"aviation", city:"Shanghai", region:"Shanghai", country:"China", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:31.1443, lng:121.8083 },
  { id:"AX-24", name:"Doha (DOH) airspace", layer:"aviation", city:"Doha", region:"Doha", country:"Qatar", continent:"Asia", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:25.2731, lng:51.6081 },
  { id:"AX-25", name:"Melbourne (MEL) airspace", layer:"aviation", city:"Melbourne", region:"Victoria", country:"Australia", continent:"Oceania", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:-37.669, lng:144.841 },
  { id:"AX-26", name:"Auckland (AKL) airspace", layer:"aviation", city:"Auckland", region:"Auckland", country:"New Zealand", continent:"Oceania", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:-37.0082, lng:174.785 },
  { id:"AX-27", name:"Cairo (CAI) airspace", layer:"aviation", city:"Cairo", region:"Cairo", country:"Egypt", continent:"Africa", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:30.1219, lng:31.4056 },
  { id:"AX-28", name:"Cape Town (CPT) airspace", layer:"aviation", city:"Cape Town", region:"Western Cape", country:"South Africa", continent:"Africa", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:-33.9715, lng:18.6021 },
  { id:"AX-29", name:"Lagos (LOS) airspace", layer:"aviation", city:"Lagos", region:"Lagos", country:"Nigeria", continent:"Africa", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:6.5774, lng:3.321 },
  { id:"AX-30", name:"Buenos Aires (EZE) airspace", layer:"aviation", city:"Buenos Aires", region:"Buenos Aires", country:"Argentina", continent:"South America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:-34.8222, lng:-58.5358 },
  { id:"AX-31", name:"Bogotá (BOG) airspace", layer:"aviation", city:"Bogotá", region:"Bogotá", country:"Colombia", continent:"South America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:4.7016, lng:-74.1469 },
  { id:"AX-32", name:"Santiago (SCL) airspace", layer:"aviation", city:"Santiago", region:"Santiago", country:"Chile", continent:"South America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:-33.393, lng:-70.7858 },
  { id:"AX-33", name:"Lima (LIM) airspace", layer:"aviation", city:"Lima", region:"Lima", country:"Peru", continent:"South America", src:"ADS-B live", url:"https://globe.adsbexchange.com/", lat:-12.0219, lng:-77.1143 },
  { id:"MX-0", name:"Port of Hamburg", layer:"marine", city:"Hamburg", region:"Hamburg", country:"Germany", continent:"Europe", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:53.54, lng:9.98 },
  { id:"MX-1", name:"Port of Antwerp", layer:"marine", city:"Antwerp", region:"Flanders", country:"Belgium", continent:"Europe", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:51.28, lng:4.32 },
  { id:"MX-2", name:"Port of Piraeus", layer:"marine", city:"Athens", region:"Attica", country:"Greece", continent:"Europe", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:37.94, lng:23.63 },
  { id:"MX-3", name:"Strait of Gibraltar", layer:"marine", city:"Gibraltar", region:"—", country:"Gibraltar", continent:"Europe", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:36.06, lng:-5.35 },
  { id:"MX-4", name:"LA / Long Beach", layer:"marine", city:"Los Angeles", region:"California", country:"United States", continent:"North America", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:33.74, lng:-118.26 },
  { id:"MX-5", name:"New York Harbor", layer:"marine", city:"New York", region:"New York", country:"United States", continent:"North America", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:40.67, lng:-74.04 },
  { id:"MX-6", name:"Port of Hong Kong", layer:"marine", city:"Hong Kong", region:"—", country:"Hong Kong", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:22.3, lng:114.13 },
  { id:"MX-7", name:"Port of Busan", layer:"marine", city:"Busan", region:"Busan", country:"South Korea", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:35.1, lng:129.04 },
  { id:"MX-8", name:"Jebel Ali (Dubai)", layer:"marine", city:"Dubai", region:"Dubai", country:"UAE", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:25.01, lng:55.06 },
  { id:"MX-9", name:"Tokyo Bay", layer:"marine", city:"Tokyo", region:"Kantō", country:"Japan", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:35.45, lng:139.8 },
  { id:"MX-10", name:"Suez Canal", layer:"marine", city:"Suez", region:"Suez", country:"Egypt", continent:"Africa", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:29.93, lng:32.55 },
  { id:"MX-11", name:"Port of Santos", layer:"marine", city:"Santos", region:"São Paulo", country:"Brazil", continent:"South America", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:-23.98, lng:-46.3 },
  { id:"MX-12", name:"Valparaíso", layer:"marine", city:"Valparaíso", region:"Valparaíso", country:"Chile", continent:"South America", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:-33.03, lng:-71.63 },
  { id:"MX-13", name:"Sydney Harbour", layer:"marine", city:"Sydney", region:"NSW", country:"Australia", continent:"Oceania", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:-33.85, lng:151.23 },
  { id:"WX-0", name:"Amazon Basin", layer:"weather", city:"—", region:"—", country:"Brazil", continent:"South America", src:"NASA Worldview", url:"https://worldview.earthdata.nasa.gov/", lat:-3, lng:-60 },
  { id:"WX-1", name:"Sahara Desert", layer:"weather", city:"—", region:"—", country:"Algeria", continent:"Africa", src:"NASA Worldview", url:"https://worldview.earthdata.nasa.gov/", lat:23, lng:13 },
  { id:"WX-2", name:"Himalayas", layer:"weather", city:"—", region:"—", country:"Nepal", continent:"Asia", src:"NASA Worldview", url:"https://worldview.earthdata.nasa.gov/", lat:28, lng:84 },
  { id:"WX-3", name:"Great Barrier Reef", layer:"weather", city:"—", region:"—", country:"Australia", continent:"Oceania", src:"NASA Worldview", url:"https://worldview.earthdata.nasa.gov/", lat:-18, lng:147 },
  { id:"WX-4", name:"Caribbean · storms", layer:"weather", city:"—", region:"—", country:"Caribbean", continent:"North America", src:"NASA Worldview", url:"https://worldview.earthdata.nasa.gov/", lat:18, lng:-66 },
  { id:"WX-5", name:"The Alps", layer:"weather", city:"—", region:"—", country:"Switzerland", continent:"Europe", src:"NASA Worldview", url:"https://worldview.earthdata.nasa.gov/", lat:46, lng:10 },
  { id:"WX-6", name:"Antarctic Peninsula", layer:"weather", city:"—", region:"—", country:"Antarctica", continent:"Global", src:"NASA Worldview", url:"https://worldview.earthdata.nasa.gov/", lat:-65, lng:-60 },
  { id:"CX-0", name:"London skyline", layer:"webcam", city:"London", region:"England", country:"United Kingdom", continent:"Europe", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:51.5, lng:-0.12 },
  { id:"CX-1", name:"Dubai Marina", layer:"webcam", city:"Dubai", region:"Dubai", country:"UAE", continent:"Asia", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:25.08, lng:55.14 },
  { id:"CX-2", name:"Barcelona · La Rambla", layer:"webcam", city:"Barcelona", region:"Catalonia", country:"Spain", continent:"Europe", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:41.38, lng:2.17 },
  { id:"CX-3", name:"Amsterdam canals", layer:"webcam", city:"Amsterdam", region:"North Holland", country:"Netherlands", continent:"Europe", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:52.37, lng:4.9 },
  { id:"CX-4", name:"Prague · Old Town", layer:"webcam", city:"Prague", region:"Prague", country:"Czechia", continent:"Europe", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:50.087, lng:14.42 },
  { id:"CX-5", name:"Santorini", layer:"webcam", city:"Santorini", region:"South Aegean", country:"Greece", continent:"Europe", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:36.42, lng:25.43 },
  { id:"CX-6", name:"Miami Beach", layer:"webcam", city:"Miami", region:"Florida", country:"United States", continent:"North America", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:25.79, lng:-80.13 },
  { id:"CX-7", name:"Waikiki Beach", layer:"webcam", city:"Honolulu", region:"Hawaii", country:"United States", continent:"North America", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:21.28, lng:-157.83 },
  { id:"CX-8", name:"Niagara Falls", layer:"webcam", city:"Niagara Falls", region:"Ontario", country:"Canada", continent:"North America", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:43.08, lng:-79.07 },
  { id:"CX-9", name:"Dubrovnik", layer:"webcam", city:"Dubrovnik", region:"Dubrovnik-Neretva", country:"Croatia", continent:"Europe", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:42.64, lng:18.11 },
  { id:"CX-10", name:"Reykjavík", layer:"webcam", city:"Reykjavík", region:"Capital", country:"Iceland", continent:"Europe", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:64.15, lng:-21.94 },
  { id:"CX-11", name:"Bondi Beach", layer:"webcam", city:"Sydney", region:"NSW", country:"Australia", continent:"Oceania", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:-33.89, lng:151.27 },
  { id:"CX-12", name:"Mount Fuji", layer:"webcam", city:"Fujiyoshida", region:"Yamanashi", country:"Japan", continent:"Asia", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:35.36, lng:138.73 },
  { id:"CX-13", name:"Matterhorn · Zermatt", layer:"webcam", city:"Zermatt", region:"Valais", country:"Switzerland", continent:"Europe", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:46.02, lng:7.75 },
  { id:"CX-14", name:"Las Vegas Strip", layer:"webcam", city:"Las Vegas", region:"Nevada", country:"United States", continent:"North America", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:36.11, lng:-115.17 },
  { id:"CX-15", name:"Copacabana · Rio", layer:"webcam", city:"Rio de Janeiro", region:"RJ", country:"Brazil", continent:"South America", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:-22.97, lng:-43.18 },
  { id:"LX-0", name:"Katmai brown bears", layer:"wildlife", city:"Katmai", region:"Alaska", country:"United States", continent:"North America", src:"Explore.org", url:"https://explore.org/livecams", lat:58.55, lng:-155.78 },
  { id:"LX-1", name:"Mpala watering hole", layer:"wildlife", city:"Laikipia", region:"—", country:"Kenya", continent:"Africa", src:"Explore.org", url:"https://explore.org/livecams", lat:0.29, lng:36.9 },
  { id:"LX-2", name:"Decorah eagles", layer:"wildlife", city:"Decorah", region:"Iowa", country:"United States", continent:"North America", src:"Explore.org", url:"https://explore.org/livecams", lat:43.3, lng:-91.79 },
  { id:"LX-3", name:"Namibia waterhole", layer:"wildlife", city:"Etosha", region:"—", country:"Namibia", continent:"Africa", src:"Explore.org", url:"https://explore.org/livecams", lat:-19, lng:15.9 },
  { id:"TX-0", name:"I-90 NY Thruway", layer:"traffic", city:"Buffalo", region:"New York", country:"United States", continent:"North America", src:"511NY", url:"https://511ny.org/cctv", lat:42.89, lng:-78.88 },
  { id:"TX-1", name:"Texas statewide", layer:"traffic", city:"Houston", region:"Texas", country:"United States", continent:"North America", src:"TxDOT DriveTexas", url:"https://drivetexas.org/", lat:29.76, lng:-95.37 },
  { id:"TX-2", name:"I-4 Corridor", layer:"traffic", city:"Orlando", region:"Florida", country:"United States", continent:"North America", src:"FL511", url:"https://fl511.com/cctv", lat:28.54, lng:-81.38 },
  { id:"TX-3", name:"I-10 Phoenix", layer:"traffic", city:"Phoenix", region:"Arizona", country:"United States", continent:"North America", src:"AZ511", url:"https://az511.gov/cctv", lat:33.45, lng:-112.07 },
  { id:"TX-4", name:"Ohio statewide", layer:"traffic", city:"Columbus", region:"Ohio", country:"United States", continent:"North America", src:"OHGO", url:"https://www.ohgo.com/", lat:39.96, lng:-82.99 },
  { id:"TX-5", name:"I-5 & the Gorge", layer:"traffic", city:"Portland", region:"Oregon", country:"United States", continent:"North America", src:"ODOT TripCheck", url:"https://tripcheck.com/", lat:45.52, lng:-122.68 },
  { id:"TX-6", name:"PA Turnpike", layer:"traffic", city:"Philadelphia", region:"Pennsylvania", country:"United States", continent:"North America", src:"511PA", url:"https://www.511pa.com/", lat:39.95, lng:-75.16 },
  { id:"TX-7", name:"I-70 Mountain", layer:"traffic", city:"Denver", region:"Colorado", country:"United States", continent:"North America", src:"COtrip", url:"https://www.cotrip.org/", lat:39.74, lng:-104.99 },
  { id:"TX-8", name:"I-15 Wasatch", layer:"traffic", city:"Salt Lake City", region:"Utah", country:"United States", continent:"North America", src:"UDOT", url:"https://www.udottraffic.utah.gov/", lat:40.76, lng:-111.89 },
  { id:"TX-9", name:"I-95 Connecticut", layer:"traffic", city:"Hartford", region:"Connecticut", country:"United States", continent:"North America", src:"CTRoads", url:"https://ctroads.org/", lat:41.76, lng:-72.68 },
  { id:"TX-10", name:"I-84 Idaho", layer:"traffic", city:"Boise", region:"Idaho", country:"United States", continent:"North America", src:"Idaho 511", url:"https://511.idaho.gov/", lat:43.62, lng:-116.2 },
  { id:"TX-11", name:"Seward Highway", layer:"traffic", city:"Anchorage", region:"Alaska", country:"United States", continent:"North America", src:"Alaska 511", url:"https://511.alaska.gov/", lat:61.22, lng:-149.9 },
  { id:"TX-12", name:"LA freeways", layer:"traffic", city:"Los Angeles", region:"California", country:"United States", continent:"North America", src:"Caltrans", url:"https://quickmap.dot.ca.gov/", lat:34.05, lng:-118.24 },
  { id:"TX-13", name:"Highway 401", layer:"traffic", city:"Toronto", region:"Ontario", country:"Canada", continent:"North America", src:"Ontario 511", url:"https://511on.ca/", lat:43.65, lng:-79.38 },
  { id:"TX-14", name:"BC highways", layer:"traffic", city:"Vancouver", region:"BC", country:"Canada", continent:"North America", src:"DriveBC", url:"https://drivebc.ca/", lat:49.28, lng:-123.12 },
  { id:"TX-15", name:"M8 motorway", layer:"traffic", city:"Glasgow", region:"Scotland", country:"United Kingdom", continent:"Europe", src:"Traffic Scotland", url:"https://trafficscotland.org/", lat:55.86, lng:-4.25 },
  { id:"TX-16", name:"Autobahn A100", layer:"traffic", city:"Berlin", region:"Berlin", country:"Germany", continent:"Europe", src:"TrafficVision", url:"https://trafficvision.live/", lat:52.52, lng:13.4 },
  { id:"TX-17", name:"Tokyo Expressway", layer:"traffic", city:"Tokyo", region:"Kantō", country:"Japan", continent:"Asia", src:"TrafficVision", url:"https://trafficvision.live/", lat:35.68, lng:139.69 },
  // TRAFFIC
  { id:"T-LDN-01", name:"A40 Westway · Paddington", layer:"traffic", city:"London", region:"England", country:"United Kingdom", continent:"Europe", src:"TfL JamCams", url:"https://www.tfljamcams.net/", lat:51.5219, lng:-0.193 },
  { id:"T-NYC-01", name:"Times Sq · 7th Ave", layer:"traffic", city:"New York", region:"New York", country:"United States", continent:"North America", src:"511NY", url:"https://511ny.org/cctv", lat:40.758, lng:-73.9855 },
  { id:"T-LAX-01", name:"US-101 · Hollywood", layer:"traffic", city:"Los Angeles", region:"California", country:"United States", continent:"North America", src:"Caltrans", url:"https://quickmap.dot.ca.gov/", lat:34.1016, lng:-118.3267 },
  { id:"T-SYD-01", name:"Harbour Bridge Deck", layer:"traffic", city:"Sydney", region:"NSW", country:"Australia", continent:"Oceania", src:"Live Traffic NSW", url:"https://www.livetraffic.com/traffic-cameras", lat:-33.8523, lng:151.2108 },
  { id:"T-PAR-01", name:"Périphérique · Porte Maillot", layer:"traffic", city:"Paris", region:"Île-de-France", country:"France", continent:"Europe", src:"Sytadin", url:"https://www.sytadin.fr/", lat:48.8779, lng:2.282 },
  // AVIATION
  { id:"A-LHR-01", name:"Heathrow (LHR) live traffic", layer:"aviation", city:"London", region:"England", country:"United Kingdom", continent:"Europe", src:"FlightRadar24", url:"https://www.flightradar24.com/airport/lhr", lat:51.47, lng:-0.4543 },
  { id:"A-JFK-01", name:"New York (JFK) airspace", layer:"aviation", city:"New York", region:"New York", country:"United States", continent:"North America", src:"ADS-B Exchange", url:"https://globe.adsbexchange.com/", lat:40.6413, lng:-73.7781 },
  { id:"A-HND-01", name:"Tokyo (HND) airspace", layer:"aviation", city:"Tokyo", region:"Kantō", country:"Japan", continent:"Asia", src:"Airplanes.Live", url:"https://globe.airplanes.live/", lat:35.5494, lng:139.7798 },
  { id:"A-DXB-01", name:"Dubai (DXB) live traffic", layer:"aviation", city:"Dubai", region:"Dubai", country:"UAE", continent:"Asia", src:"FlightRadar24", url:"https://www.flightradar24.com/airport/dxb", lat:25.2532, lng:55.3657 },
  { id:"A-JNB-01", name:"Johannesburg (JNB) live", layer:"aviation", city:"Johannesburg", region:"Gauteng", country:"South Africa", continent:"Africa", src:"FlightRadar24", url:"https://www.flightradar24.com/airport/jnb", lat:-26.1367, lng:28.2411 },
  // MARINE
  { id:"M-SIN-01", name:"Port of Singapore", layer:"marine", city:"Singapore", region:"—", country:"Singapore", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:1.264, lng:103.84 },
  { id:"M-RTM-01", name:"Port of Rotterdam", layer:"marine", city:"Rotterdam", region:"South Holland", country:"Netherlands", continent:"Europe", src:"VesselFinder", url:"https://www.vesselfinder.com/", lat:51.95, lng:4.14 },
  { id:"M-PAN-01", name:"Panama Canal transit", layer:"marine", city:"Panama City", region:"Panamá", country:"Panama", continent:"North America", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:9.08, lng:-79.68 },
  // EARTH / WEATHER
  { id:"W-GOE-01", name:"GOES-East · Americas", layer:"weather", city:"Full disk", region:"—", country:"Americas", continent:"North America", src:"NOAA STAR", url:"https://www.star.nesdis.noaa.gov/goes/", lat:25, lng:-75 },
  { id:"W-WLD-01", name:"NASA Worldview · global", layer:"weather", city:"Global", region:"—", country:"Worldwide", continent:"Global", src:"NASA EOSDIS", url:"https://worldview.earthdata.nasa.gov/", lat:5, lng:20 },
  { id:"W-HIM-01", name:"Himawari · Asia-Pacific", layer:"weather", city:"Full disk", region:"—", country:"Asia-Pacific", continent:"Asia", src:"Zoom Earth", url:"https://zoom.earth/", lat:35, lng:140 },
  // WEBCAMS (public)
  { id:"C-TYO-01", name:"Shibuya Scramble live", layer:"webcam", city:"Tokyo", region:"Kantō", country:"Japan", continent:"Asia", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:35.6595, lng:139.7005 },
  { id:"C-NYC-01", name:"Times Square street cam", layer:"webcam", city:"New York", region:"New York", country:"United States", continent:"North America", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:40.758, lng:-73.9855 },
  { id:"C-VEN-01", name:"St Mark's Square", layer:"webcam", city:"Venice", region:"Veneto", country:"Italy", continent:"Europe", src:"SkylineWebcams", url:"https://www.skylinewebcams.com/", lat:45.434, lng:12.338 },
  { id:"C-RIO-01", name:"Copacabana Beach", layer:"webcam", city:"Rio de Janeiro", region:"RJ", country:"Brazil", continent:"South America", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:-22.97, lng:-43.18 },
  { id:"C-CPT-01", name:"Table Mountain", layer:"webcam", city:"Cape Town", region:"Western Cape", country:"South Africa", continent:"Africa", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:-33.96, lng:18.41 },
  // WILDLIFE
  { id:"L-KRU-01", name:"African watering hole", layer:"wildlife", city:"Greater Kruger", region:"—", country:"South Africa", continent:"Africa", src:"Explore.org", url:"https://explore.org/livecams", lat:-24.0, lng:31.5 },
  { id:"L-MTY-01", name:"Monterey Bay kelp cam", layer:"wildlife", city:"Monterey", region:"California", country:"United States", continent:"North America", src:"Monterey Bay Aquarium", url:"https://www.montereybayaquarium.org/cams-videos/live-cams", lat:36.618, lng:-121.9 },
  { id:"L-CTU-01", name:"Chengdu panda cam", layer:"wildlife", city:"Chengdu", region:"Sichuan", country:"China", continent:"Asia", src:"Explore.org", url:"https://explore.org/livecams", lat:30.7, lng:104.1 },
  // SPACE
  { id:"S-ISS-01", name:"ISS · Earth from orbit", layer:"space", city:"Low Earth Orbit", region:"—", country:"Orbital", continent:"Global", src:"NASA Live", url:"https://www.nasa.gov/live/", lat:0, lng:0 },
  { id:"S-ISS-02", name:"ISS live position tracker", layer:"space", city:"Low Earth Orbit", region:"—", country:"Orbital", continent:"Global", src:"Spot the Station", url:"https://www.nasa.gov/spot-the-station/", lat:0, lng:-30 },
  // INDIA
  { id:"A-DEL-01", name:"Delhi (DEL) airspace", layer:"aviation", city:"New Delhi", region:"Delhi", country:"India", continent:"Asia", src:"FlightRadar24", url:"https://www.flightradar24.com/airport/del", lat:28.5562, lng:77.1 },
  { id:"A-BOM-01", name:"Mumbai (BOM) airspace", layer:"aviation", city:"Mumbai", region:"Maharashtra", country:"India", continent:"Asia", src:"FlightRadar24", url:"https://www.flightradar24.com/airport/bom", lat:19.0896, lng:72.8656 },
  { id:"M-BOM-01", name:"Mumbai Harbour ships", layer:"marine", city:"Mumbai", region:"Maharashtra", country:"India", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:18.95, lng:72.95 },
  { id:"C-BOM-01", name:"Marine Drive live", layer:"webcam", city:"Mumbai", region:"Maharashtra", country:"India", continent:"Asia", src:"Windy Webcams", url:"https://www.windy.com/webcams", lat:18.944, lng:72.823 },
  { id:"W-IND-01", name:"India monsoon · satellite", layer:"weather", city:"Subcontinent", region:"—", country:"India", continent:"Asia", src:"Zoom Earth", url:"https://zoom.earth/#view=22,79,5z", lat:22, lng:79 },
  // MORE COUNTRIES
  { id:"A-FRA-01", name:"Frankfurt (FRA) airspace", layer:"aviation", city:"Frankfurt", region:"Hesse", country:"Germany", continent:"Europe", src:"FlightRadar24", url:"https://www.flightradar24.com/airport/fra", lat:50.0379, lng:8.5622 },
  { id:"A-YYZ-01", name:"Toronto (YYZ) airspace", layer:"aviation", city:"Toronto", region:"Ontario", country:"Canada", continent:"North America", src:"FlightRadar24", url:"https://www.flightradar24.com/airport/yyz", lat:43.6777, lng:-79.6248 },
  { id:"A-GRU-01", name:"São Paulo (GRU) airspace", layer:"aviation", city:"São Paulo", region:"São Paulo", country:"Brazil", continent:"South America", src:"FlightRadar24", url:"https://www.flightradar24.com/airport/gru", lat:-23.4356, lng:-46.4731 },
  { id:"A-NBO-01", name:"Nairobi (NBO) airspace", layer:"aviation", city:"Nairobi", region:"Nairobi", country:"Kenya", continent:"Africa", src:"FlightRadar24", url:"https://www.flightradar24.com/airport/nbo", lat:-1.3192, lng:36.9278 },
  { id:"M-SHA-01", name:"Port of Shanghai", layer:"marine", city:"Shanghai", region:"—", country:"China", continent:"Asia", src:"MarineTraffic", url:"https://www.marinetraffic.com/", lat:31.34, lng:121.5 },
  { id:"M-HEL-01", name:"Helsinki · Gulf of Finland", layer:"marine", city:"Helsinki", region:"Uusimaa", country:"Finland", continent:"Europe", src:"Digitraffic AIS", url:"https://www.digitraffic.fi/en/marine-traffic/", lat:60.15, lng:24.95 },
  { id:"C-BER-01", name:"Brandenburg Gate", layer:"webcam", city:"Berlin", region:"Berlin", country:"Germany", continent:"Europe", src:"SkylineWebcams", url:"https://www.skylinewebcams.com/", lat:52.5163, lng:13.3777 },
];

// Route app-pushy sources to web-first viewers that render in the browser.
const resolveUrl = (cam) =>
  cam.layer === "aviation"
    ? `https://globe.adsbexchange.com/?SiteLat=${cam.lat.toFixed(3)}&SiteLon=${cam.lng.toFixed(3)}`
    : cam.url;
const openLive = (cam) => { if (typeof window !== "undefined") window.open(resolveUrl(cam), "_blank", "noopener,noreferrer"); };

// ===========================================================================
//  LIVE AVIATION — set BACKEND_URL to your deployed adsb-proxy.js to go live.
//  Empty string => realistic simulation so it runs with no backend.
// ===========================================================================
const BACKEND_URL = "https://streetwatch-proxy.onrender.com";
const RAD = Math.PI / 180;
const distKm = (aLat, aLng, bLat, bLng) => {
  const dLat = (bLat - aLat) * RAD, dLng = (bLng - aLng) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
};
const altColor = (a) => a.onGround ? "#6B7280" : a.altFt == null ? C.dim
  : a.altFt < 10000 ? C.amber : a.altFt < 25000 ? C.cyan : a.altFt < 35000 ? "#A78BFA" : "#E8EAED";
const PFX = ["BAW","UAL","DLH","UAE","AIC","JAL","QFA","AFR","KLM","SIA","THY","QTR","ANA","CPA","AAL","SWR"];
const ACT = ["A320","B738","A21N","B77W","A35K","B789","A388","E190","B38M","A333"];
const rnd = (a, b) => a + Math.random() * (b - a);
function seedSim(clat, clon, radiusNm, n = 14) {
  const out = {};
  for (let i = 0; i < n; i++) {
    const ang = rnd(0, 2 * Math.PI), dist = Math.sqrt(Math.random()) * radiusNm * 0.95;
    const g = Math.random() < 0.1;
    out["sim" + i] = {
      id: "sim" + i, callsign: PFX[(Math.random() * PFX.length) | 0] + ((100 + Math.random() * 899) | 0),
      typeCode: ACT[(Math.random() * ACT.length) | 0],
      lat: clat + (dist * Math.cos(ang)) / 60, lon: clon + (dist * Math.sin(ang)) / (60 * Math.cos(clat * RAD)),
      headingDeg: rnd(0, 360), groundSpeedKt: g ? rnd(8, 25) : rnd(280, 500),
      altFt: g ? 0 : Math.round(rnd(3, 40)) * 1000, onGround: g,
    };
  }
  return out;
}

// Embedded ADS-B radar centered on the selected airport.
function AviationRadar({ center }) {
  const [status, setStatus] = useState("sim");
  const [, setTick] = useState(0);
  const [sel, setSel] = useState(null);
  const [radius, setRadius] = useState(100);
  const acRef = useRef({}); const lastRef = useRef(Date.now()); const liveRef = useRef(false); const failRef = useRef(0);

  useEffect(() => {
    acRef.current = seedSim(center.lat, center.lng, radius); lastRef.current = Date.now(); setSel(null); failRef.current = 0;
    let alive = true;
    async function poll() {
      if (!BACKEND_URL) { setStatus("sim"); liveRef.current = false; return; }
      try {
        const ctl = AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined;
        const r = await fetch(`${BACKEND_URL}/api/aircraft?lat=${center.lat}&lon=${center.lng}&radius=${radius}`, { signal: ctl });
        if (!r.ok) throw new Error();
        const j = await r.json(); if (!alive) return;
        const inc = (j.aircraft || []).filter((a) => a.headingDeg != null && a.groundSpeedKt != null);
        if (inc.length) { const prev = acRef.current, merged = {}; inc.forEach((a) => { const o = prev[a.id]; merged[a.id] = { ...a, tLat: a.lat, tLon: a.lon, lat: o ? o.lat : a.lat, lon: o ? o.lon : a.lon }; }); acRef.current = merged; }
        liveRef.current = true; failRef.current = 0; setStatus("live");
      } catch {
        if (!alive) return;
        failRef.current += 1;
        if (!BACKEND_URL) { setStatus("sim"); liveRef.current = false; }
        else if (failRef.current >= 3) { liveRef.current = false; setStatus("error"); }  // tolerate cold-start hiccups
        else if (!liveRef.current) setStatus("connecting");
      }
    }
    poll();
    const pollId = BACKEND_URL ? setInterval(poll, 5000) : null;
    const tickId = setInterval(() => {
      const now = Date.now(), dt = (now - lastRef.current) / 1000; lastRef.current = now;
      Object.values(acRef.current).forEach((a) => {
        if (liveRef.current) {
          if (a.tLat != null) { a.lat += (a.tLat - a.lat) * 0.15; a.lon += (a.tLon - a.lon) * 0.15; }
          return;
        }
        if (a.onGround || !a.groundSpeedKt) return;
        const dNm = (a.groundSpeedKt * dt) / 3600;
        a.lat += (dNm * Math.cos(a.headingDeg * RAD)) / 60;
        a.lon += (dNm * Math.sin(a.headingDeg * RAD)) / (60 * Math.cos(center.lat * RAD));
        const dx = (a.lon - center.lng) * Math.cos(center.lat * RAD) * 60, dy = (a.lat - center.lat) * 60;
        if (Math.hypot(dx, dy) > radius * 1.1) {
          const ang = rnd(0, 2 * Math.PI);
          a.lat = center.lat + (radius * 0.9 * Math.cos(ang)) / 60;
          a.lon = center.lng + (radius * 0.9 * Math.sin(ang)) / (60 * Math.cos(center.lat * RAD));
          a.headingDeg = (ang / RAD + 180) % 360;
        }
      });
      setTick((t) => t + 1);
    }, 250);
    return () => { alive = false; if (pollId) clearInterval(pollId); clearInterval(tickId); };
  }, [center, radius]); // eslint-disable-line

  const R = 180, cx = 200, cy = 200;
  const plotted = Object.values(acRef.current).map((a) => {
    const dx = (a.lon - center.lng) * Math.cos(center.lat * RAD) * 60, dy = (a.lat - center.lat) * 60;
    const d = Math.hypot(dx, dy);
    return { ...a, d, x: cx + (dx / radius) * R, y: cy - (dy / radius) * R };
  }).filter((a) => a.d <= radius).sort((a, b) => a.d - b.d);
  const chosen = plotted.find((a) => a.id === sel);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="relative w-full overflow-hidden rounded-lg" style={{ border: `1px solid ${C.line}`, background: "#0A0E14" }}>
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2"
        style={{ background: "linear-gradient(180deg, rgba(10,14,20,0.9), rgba(10,14,20,0))" }}>
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded font-mono"
          style={{ fontSize: 11, letterSpacing: 1, background: status === "live" ? "rgba(55,196,106,0.16)" : status === "error" ? "rgba(240,85,59,0.16)" : "rgba(246,168,33,0.16)",
            color: status === "live" ? "#37C46A" : status === "error" ? "#F0553B" : C.amber }}>
          {status === "live" ? <Wifi size={12} /> : <WifiOff size={12} />}{status === "live" ? "LIVE" : status === "error" ? "PROXY DOWN" : "SIM"}
        </span>
        <div className="flex items-center gap-1">
          {[60, 120, 250].map((r) => (
            <button key={r} onClick={() => setRadius(r)} className="px-1.5 py-0.5 rounded font-mono"
              style={{ fontSize: 10, color: radius === r ? C.ink : C.dim, background: radius === r ? C.cyan : "rgba(28,32,41,0.8)" }}>{r}nm</button>
          ))}
        </div>
      </div>
      <svg viewBox="0 0 400 400" className="w-full" style={{ display: "block", maxHeight: 420 }}>
        <defs>
          <radialGradient id="sc" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#0F1620" /><stop offset="100%" stopColor="#090D12" /></radialGradient>
          <linearGradient id="sw" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="rgba(90,200,250,0)" /><stop offset="100%" stopColor="rgba(90,200,250,0.28)" /></linearGradient>
        </defs>
        <circle cx="200" cy="200" r="182" fill="url(#sc)" stroke={C.line} />
        {[0.33, 0.66, 1].map((f, i) => <circle key={i} cx="200" cy="200" r={180 * f} fill="none" stroke={C.line} strokeDasharray="2 4" />)}
        {[0.33, 0.66, 1].map((f, i) => <text key={i} x="204" y={200 - 180 * f + 12} fill={C.faint} fontSize="9" fontFamily="monospace">{Math.round(radius * f)}nm</text>)}
        <line x1="200" y1="22" x2="200" y2="378" stroke={C.line} /><line x1="22" y1="200" x2="378" y2="200" stroke={C.line} />
        {[["N",200,32],["E",372,204],["S",200,376],["W",26,204]].map(([d, x, y]) => <text key={d} x={x} y={y} fill={C.dim} fontSize="11" fontFamily="monospace" textAnchor="middle">{d}</text>)}
        {!reduce && status !== "error" && <g className="rsweep"><polygon points="200,200 200,24 258,42" fill="url(#sw)" /></g>}
        {plotted.map((a) => {
          const col = altColor(a), isSel = a.id === sel;
          return (
            <g key={a.id} transform={`translate(${a.x} ${a.y})`} onClick={() => setSel(a.id)} style={{ cursor: "pointer" }}>
              {isSel && <circle r="11" fill="none" stroke={col} strokeWidth="1" />}
              <g transform={`rotate(${a.headingDeg || 0})`}><polygon className={isSel ? "" : "rblip"} points="0,-6 4,5 0,2.5 -4,5" fill={col} stroke="#0A0E14" strokeWidth="0.5" /></g>
              {isSel && <text x="10" y="3" fill={col} fontSize="9" fontFamily="monospace">{a.callsign || a.id}</text>}
            </g>
          );
        })}
        <circle cx="200" cy="200" r="3" fill={C.cyan} />
      </svg>
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2 font-mono"
        style={{ background: "linear-gradient(0deg, rgba(10,14,20,0.92), rgba(10,14,20,0))", fontSize: 11 }}>
        {chosen ? (
          <span style={{ color: altColor(chosen) }}>{chosen.callsign} · {chosen.typeCode || "—"} · {chosen.onGround ? "GND" : (chosen.altFt / 1000).toFixed(0) + "k ft"} · {chosen.groundSpeedKt}kt · {Math.round(chosen.headingDeg)}°</span>
        ) : (<span style={{ color: C.faint }}>Tap an aircraft · {plotted.length} in range</span>)}
        <span style={{ color: C.dim }}>{center.name.split("·").pop().trim() || center.city}</span>
      </div>
    </div>
  );
}

// ---- Marine (AIS) — set AIS_BACKEND_URL to your deployed ais-proxy.js. ----
const AIS_BACKEND_URL = "https://streetwatch-proxy.onrender.com";
const SHIP_PFX = ["MSC","MAERSK","EVER","NORDIC","BALTIC","AURORA","FINNLINES","TALLINK","STENA","HAPAG","ONE","WALLENIUS"];
const SHIP_NM = ["STAR","SPIRIT","VOYAGER","TRADER","EXPRESS","PIONEER","HORIZON","GALAXY","BOTNIA","EUROPA"];
const shipColor = (v) => (v.sogKt == null || v.sogKt < 0.5) ? "#6B7280" : v.sogKt < 7 ? "#2DD4BF" : C.cyan;
function seedSimShips(clat, clon, radiusNm, n = 16) {
  const out = {};
  for (let i = 0; i < n; i++) {
    const ang = rnd(0, 2 * Math.PI), dist = Math.sqrt(Math.random()) * radiusNm * 0.95, cog = rnd(0, 360);
    const moored = Math.random() < 0.35;
    out["s" + i] = {
      id: "s" + i, name: SHIP_PFX[(Math.random() * SHIP_PFX.length) | 0] + " " + SHIP_NM[(Math.random() * SHIP_NM.length) | 0],
      typeCode: 70, lat: clat + (dist * Math.cos(ang)) / 60, lon: clon + (dist * Math.sin(ang)) / (60 * Math.cos(clat * RAD)),
      cogDeg: cog, headingDeg: moored ? null : cog, sogKt: moored ? 0 : rnd(4, 18), navStatus: moored ? 5 : 0,
    };
  }
  return out;
}

// Embedded AIS radar centered on the selected port/harbour.
function MarineRadar({ center }) {
  const [status, setStatus] = useState("sim");
  const [, setTick] = useState(0);
  const [sel, setSel] = useState(null);
  const [radius, setRadius] = useState(40);
  const acRef = useRef({}); const lastRef = useRef(Date.now()); const liveRef = useRef(false); const failRef = useRef(0);

  useEffect(() => {
    acRef.current = seedSimShips(center.lat, center.lng, radius); lastRef.current = Date.now(); setSel(null); failRef.current = 0;
    let alive = true;
    async function poll() {
      if (!AIS_BACKEND_URL) { setStatus("sim"); liveRef.current = false; return; }
      try {
        const ctl = AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined;
        const r = await fetch(`${AIS_BACKEND_URL}/api/vessels?lat=${center.lat}&lon=${center.lng}&radius=${radius}`, { signal: ctl });
        if (!r.ok) throw new Error();
        const j = await r.json(); if (!alive) return;
        const inc = (j.vessels || []).filter((v) => typeof v.lat === "number");
        if (inc.length) { const prev = acRef.current, merged = {}; inc.forEach((v) => { const o = prev[v.id]; merged[v.id] = { ...v, tLat: v.lat, tLon: v.lon, lat: o ? o.lat : v.lat, lon: o ? o.lon : v.lon }; }); acRef.current = merged; }
        liveRef.current = true; failRef.current = 0; setStatus("live");
      } catch {
        if (!alive) return;
        failRef.current += 1;
        if (failRef.current >= 3) { liveRef.current = false; setStatus("error"); }
        else if (!liveRef.current) setStatus("connecting");
      }
    }
    poll();
    const pollId = AIS_BACKEND_URL ? setInterval(poll, 6000) : null;
    const tickId = setInterval(() => {
      const now = Date.now(), dt = (now - lastRef.current) / 1000; lastRef.current = now;
      Object.values(acRef.current).forEach((v) => {
        if (liveRef.current) {
          if (v.tLat != null) { v.lat += (v.tLat - v.lat) * 0.15; v.lon += (v.tLon - v.lon) * 0.15; }
          return;
        }
        if (!v.sogKt || v.sogKt < 0.5) return;
        const dir = (v.headingDeg != null ? v.headingDeg : v.cogDeg) || 0;
        const dNm = (v.sogKt * dt) / 3600;
        v.lat += (dNm * Math.cos(dir * RAD)) / 60;
        v.lon += (dNm * Math.sin(dir * RAD)) / (60 * Math.cos(center.lat * RAD));
        const dx = (v.lon - center.lng) * Math.cos(center.lat * RAD) * 60, dy = (v.lat - center.lat) * 60;
        if (Math.hypot(dx, dy) > radius * 1.1) {
          const ang = rnd(0, 2 * Math.PI);
          v.lat = center.lat + (radius * 0.9 * Math.cos(ang)) / 60;
          v.lon = center.lng + (radius * 0.9 * Math.sin(ang)) / (60 * Math.cos(center.lat * RAD));
          v.cogDeg = (ang / RAD + 180) % 360; v.headingDeg = v.cogDeg;
        }
      });
      setTick((t) => t + 1);
    }, 250);
    return () => { alive = false; if (pollId) clearInterval(pollId); clearInterval(tickId); };
  }, [center, radius]); // eslint-disable-line

  const R = 180, cx = 200, cy = 200, teal = "#2DD4BF";
  const plotted = Object.values(acRef.current).map((v) => {
    const dx = (v.lon - center.lng) * Math.cos(center.lat * RAD) * 60, dy = (v.lat - center.lat) * 60;
    const d = Math.hypot(dx, dy);
    return { ...v, d, x: cx + (dx / radius) * R, y: cy - (dy / radius) * R };
  }).filter((v) => v.d <= radius).sort((a, b) => a.d - b.d);
  const chosen = plotted.find((v) => v.id === sel);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="relative w-full overflow-hidden rounded-lg" style={{ border: `1px solid ${C.line}`, background: "#08130F" }}>
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2"
        style={{ background: "linear-gradient(180deg, rgba(8,19,15,0.9), rgba(8,19,15,0))" }}>
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded font-mono"
          style={{ fontSize: 11, letterSpacing: 1, background: status === "live" ? "rgba(55,196,106,0.16)" : status === "error" ? "rgba(240,85,59,0.16)" : "rgba(246,168,33,0.16)",
            color: status === "live" ? "#37C46A" : status === "error" ? "#F0553B" : C.amber }}>
          {status === "live" ? <Wifi size={12} /> : <WifiOff size={12} />}{status === "live" ? "LIVE" : status === "error" ? "PROXY DOWN" : "SIM"}
        </span>
        <div className="flex items-center gap-1">
          {[20, 50, 100].map((r) => (
            <button key={r} onClick={() => setRadius(r)} className="px-1.5 py-0.5 rounded font-mono"
              style={{ fontSize: 10, color: radius === r ? C.ink : C.dim, background: radius === r ? teal : "rgba(20,28,25,0.8)" }}>{r}nm</button>
          ))}
        </div>
      </div>
      <svg viewBox="0 0 400 400" className="w-full" style={{ display: "block", maxHeight: 420 }}>
        <defs>
          <radialGradient id="scm" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#0C1A16" /><stop offset="100%" stopColor="#07110D" /></radialGradient>
          <linearGradient id="swm" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="rgba(45,212,191,0)" /><stop offset="100%" stopColor="rgba(45,212,191,0.26)" /></linearGradient>
        </defs>
        <circle cx="200" cy="200" r="182" fill="url(#scm)" stroke={C.line} />
        {[0.33, 0.66, 1].map((f, i) => <circle key={i} cx="200" cy="200" r={180 * f} fill="none" stroke={C.line} strokeDasharray="2 4" />)}
        {[0.33, 0.66, 1].map((f, i) => <text key={i} x="204" y={200 - 180 * f + 12} fill={C.faint} fontSize="9" fontFamily="monospace">{Math.round(radius * f)}nm</text>)}
        <line x1="200" y1="22" x2="200" y2="378" stroke={C.line} /><line x1="22" y1="200" x2="378" y2="200" stroke={C.line} />
        {[["N", 200, 32], ["E", 372, 204], ["S", 200, 376], ["W", 26, 204]].map(([d, x, y]) => <text key={d} x={x} y={y} fill={C.dim} fontSize="11" fontFamily="monospace" textAnchor="middle">{d}</text>)}
        {!reduce && status !== "error" && <g className="rsweep"><polygon points="200,200 200,24 258,42" fill="url(#swm)" /></g>}
        {plotted.map((v) => {
          const col = shipColor(v), isSel = v.id === sel, moving = v.sogKt != null && v.sogKt >= 0.5;
          const dir = (v.headingDeg != null ? v.headingDeg : v.cogDeg) || 0;
          return (
            <g key={v.id} transform={`translate(${v.x} ${v.y})`} onClick={() => setSel(v.id)} style={{ cursor: "pointer" }}>
              {isSel && <circle r="11" fill="none" stroke={col} strokeWidth="1" />}
              {moving
                ? <g transform={`rotate(${dir})`}><polygon className={isSel ? "" : "rblip"} points="0,-7 3,-1 2.5,6 -2.5,6 -3,-1" fill={col} stroke="#08130F" strokeWidth="0.5" /></g>
                : <rect className={isSel ? "" : "rblip"} x="-3" y="-3" width="6" height="6" fill={col} stroke="#08130F" strokeWidth="0.5" transform="rotate(45)" />}
              {isSel && <text x="10" y="3" fill={col} fontSize="9" fontFamily="monospace">{v.name || v.id}</text>}
            </g>
          );
        })}
        <circle cx="200" cy="200" r="3" fill={teal} />
      </svg>
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2 font-mono"
        style={{ background: "linear-gradient(0deg, rgba(8,19,15,0.92), rgba(8,19,15,0))", fontSize: 11 }}>
        {chosen ? (
          <span style={{ color: shipColor(chosen) }}>{chosen.name || chosen.id} · {chosen.sogKt != null ? chosen.sogKt.toFixed(1) + "kt" : "—"} · {chosen.cogDeg != null ? Math.round(chosen.cogDeg) + "°" : "moored"}</span>
        ) : (<span style={{ color: C.faint }}>Tap a vessel · {plotted.length} in range</span>)}
        <span style={{ color: C.dim }}>{center.city}</span>
      </div>
    </div>
  );
}

// ---- Earth / weather — real NASA satellite imagery (no backend, CORS-free img). ----
const GIBS_LAYERS = [
  { id: "MODIS_Terra_CorrectedReflectance_TrueColor", label: "Terra" },
  { id: "MODIS_Aqua_CorrectedReflectance_TrueColor", label: "Aqua" },
  { id: "VIIRS_SNPP_CorrectedReflectance_TrueColor", label: "VIIRS" },
  { id: "MODIS_Terra_CorrectedReflectance_Bands721", label: "721·IR" },
];
const ymd = (d) => d.toISOString().slice(0, 10);
function EarthView({ center }) {
  const [layer, setLayer] = useState(GIBS_LAYERS[0].id);
  const [back, setBack] = useState(1);
  const [err, setErr] = useState(false);
  const violet = "#A78BFA";
  const date = new Date(Date.now() - back * 86400000);
  const time = ymd(date);
  const latSpan = 18, lonSpan = 24;
  const minLat = Math.max(-90, center.lat - latSpan / 2), maxLat = Math.min(90, center.lat + latSpan / 2);
  const minLon = Math.max(-180, center.lng - lonSpan / 2), maxLon = Math.min(180, center.lng + lonSpan / 2);
  const src = `https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&TIME=${time}` +
    `&BBOX=${minLat.toFixed(3)},${minLon.toFixed(3)},${maxLat.toFixed(3)},${maxLon.toFixed(3)}` +
    `&CRS=EPSG:4326&LAYERS=${layer}&FORMAT=image/jpeg&WIDTH=640&HEIGHT=480`;
  useEffect(() => { setErr(false); }, [src]);
  const rel = back === 1 ? "yesterday" : `${back} days ago`;

  return (
    <div className="relative w-full overflow-hidden rounded-lg" style={{ border: `1px solid ${C.line}`, background: "#0A0A12", aspectRatio: "4 / 3" }}>
      {!err ? (
        <img src={src} alt={`Satellite imagery near ${center.city}`} onError={() => setErr(true)}
          className="w-full h-full" style={{ objectFit: "cover", display: "block" }} />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-6 text-center">
          <CloudSun size={40} color={violet} strokeWidth={1.4} />
          <div style={{ color: C.dim, fontSize: 13 }}>No imagery for {time} at this spot — try an earlier day or another layer.</div>
        </div>
      )}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2"
        style={{ background: "linear-gradient(180deg, rgba(10,10,18,0.85), rgba(10,10,18,0))" }}>
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded font-mono" style={{ fontSize: 11, letterSpacing: 1, background: `${violet}22`, color: violet }}>
          <SignalHigh size={12} /> NRT · DAILY
        </span>
        <div className="flex items-center gap-1">
          {GIBS_LAYERS.map((l) => (
            <button key={l.id} onClick={() => setLayer(l.id)} className="px-1.5 py-0.5 rounded font-mono"
              style={{ fontSize: 10, color: layer === l.id ? C.ink : C.dim, background: layer === l.id ? violet : "rgba(20,18,30,0.75)" }}>{l.label}</button>
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 px-3 py-2" style={{ background: "linear-gradient(0deg, rgba(10,10,18,0.92), rgba(10,10,18,0))" }}>
        <div className="flex items-center justify-between font-mono" style={{ fontSize: 11, color: C.dim }}>
          <span style={{ color: violet }}>{time} · {rel}</span>
          <span style={{ color: C.faint }}>NASA Worldview / GIBS</span>
        </div>
        <input type="range" min={1} max={8} step={1} value={back} onChange={(e) => setBack(parseInt(e.target.value, 10))}
          className="w-full mt-1.5" style={{ accentColor: violet }} />
      </div>
    </div>
  );
}

// ---- Space — live ISS tracker (keyless CORS-open API, no backend). ----
function SpaceView() {
  const [pos, setPos] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [bgErr, setBgErr] = useState(false);
  const liveRef = useRef(false); const everRef = useRef(false);
  const trackRef = useRef([]); const simRef = useRef({ phase: 0, lon: -30 });
  const [, setTick] = useState(0);
  const pink = "#F472B6";
  const push = (lat, lon) => { const t = trackRef.current; const p = t[t.length - 1]; if (!p || Math.abs(p[1] - lon) < 60) t.push([lat, lon]); else t.push(null, [lat, lon]); if (t.length > 140) t.shift(); };

  useEffect(() => {
    let alive = true;
    async function pull() {
      try {
        const r = await fetch("https://api.wheretheiss.at/v1/satellites/25544");
        if (!r.ok) throw new Error();
        const j = await r.json(); if (!alive) return;
        liveRef.current = true; everRef.current = true; setStatus("live");
        const p = { lat: j.latitude, lon: j.longitude, altKm: j.altitude, velKmh: j.velocity };
        setPos(p); push(p.lat, p.lon);
      } catch { liveRef.current = false; if (!everRef.current) setStatus("sim"); }
    }
    pull();
    const pollId = setInterval(pull, 3000);
    const tickId = setInterval(() => {
      if (!liveRef.current) {
        const st = simRef.current;
        st.phase += (2 * Math.PI) / (92.9 * 60) * 4;      // accelerated for visibility
        st.lon = ((st.lon + 0.9 + 540) % 360) - 180;
        const lat = 51.6 * Math.sin(st.phase);
        const p = { lat, lon: st.lon, altKm: 420, velKmh: 27600 };
        setPos(p); push(lat, st.lon); setStatus("sim");
      }
      setTick((t) => t + 1);
    }, 1000);
    return () => { alive = false; clearInterval(pollId); clearInterval(tickId); };
  }, []);

  const W = 720, H = 360;
  const px = (lon) => ((lon + 180) / 360) * W;
  const py = (lat) => ((90 - lat) / 180) * H;
  const bg = `https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&TIME=2024-01-01&BBOX=-90,-180,90,180&CRS=EPSG:4326&LAYERS=BlueMarble_ShadedRelief_Bathymetry&FORMAT=image/jpeg&WIDTH=720&HEIGHT=360`;

  return (
    <div className="relative w-full overflow-hidden rounded-lg" style={{ border: `1px solid ${C.line}`, background: "#04121F", aspectRatio: "2 / 1" }}>
      {!bgErr && <img src={bg} alt="" onError={() => setBgErr(true)} className="absolute inset-0 w-full h-full" style={{ objectFit: "cover", opacity: 0.85 }} />}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block", position: "relative" }}>
        {bgErr && <rect x="0" y="0" width={W} height={H} fill="#08131F" />}
        {[-60, -30, 0, 30, 60].map((la) => <line key={la} x1="0" y1={py(la)} x2={W} y2={py(la)} stroke="rgba(138,148,163,0.18)" strokeWidth="1" />)}
        {[-120, -60, 0, 60, 120].map((lo) => <line key={lo} x1={px(lo)} y1="0" x2={px(lo)} y2={H} stroke="rgba(138,148,163,0.18)" strokeWidth="1" />)}
        {trackRef.current.map((p, i) => p && trackRef.current[i - 1] ? (
          <line key={i} x1={px(trackRef.current[i - 1][1])} y1={py(trackRef.current[i - 1][0])} x2={px(p[1])} y2={py(p[0])} stroke={pink} strokeWidth="1.4" opacity="0.5" />
        ) : null)}
        {pos && (
          <g transform={`translate(${px(pos.lon)} ${py(pos.lat)})`}>
            <circle r="10" fill="none" stroke={pink} strokeWidth="1" className="rblip" />
            <circle r="4" fill={pink} stroke="#04121F" strokeWidth="1" />
            <text x="10" y="-8" fill={pink} fontSize="11" fontFamily="monospace">ISS</text>
          </g>
        )}
      </svg>
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2" style={{ background: "linear-gradient(180deg, rgba(4,18,31,0.85), rgba(4,18,31,0))" }}>
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded font-mono" style={{ fontSize: 11, letterSpacing: 1, background: status === "live" ? "rgba(55,196,106,0.16)" : "rgba(246,168,33,0.16)", color: status === "live" ? "#37C46A" : C.amber }}>
          <Satellite size={12} />{status === "live" ? "LIVE · ISS" : status === "connecting" ? "CONNECTING" : "SIM · ISS"}
        </span>
        <span className="font-mono" style={{ fontSize: 10, color: C.faint }}>wheretheiss.at</span>
      </div>
      {pos && (
        <div className="absolute bottom-0 left-0 right-0 grid grid-cols-4 gap-2 px-3 py-2 font-mono" style={{ background: "linear-gradient(0deg, rgba(4,18,31,0.92), rgba(4,18,31,0))", fontSize: 11 }}>
          {[["LAT", pos.lat.toFixed(2) + "°"], ["LON", pos.lon.toFixed(2) + "°"], ["ALT", Math.round(pos.altKm) + " km"], ["VEL", Math.round(pos.velKmh).toLocaleString() + " km/h"]].map(([k, v]) => (
            <div key={k}><div style={{ color: C.faint, fontSize: 9 }}>{k}</div><div style={{ color: pink }}>{v}</div></div>
          ))}
        </div>
      )}
    </div>
  );
}

function WorldMap({ feeds, selectedId, onSelect }) {
  const elRef = useRef(null); const mapRef = useRef(null); const layerRef = useRef(null);
  useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    try {
      const map = Leaflet.map(elRef.current, { center: [20, 0], zoom: 2, worldCopyJump: true, preferCanvas: true });
      Leaflet.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd", maxZoom: 19, attribution: "&copy; OpenStreetMap, &copy; CARTO",
      }).addTo(map);
      layerRef.current = Leaflet.layerGroup().addTo(map);
      mapRef.current = map;
      setTimeout(() => { try { map.invalidateSize(); } catch {} }, 200);
    } catch {}
    return () => { try { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } } catch {} };
  }, []);
  useEffect(() => {
    const lg = layerRef.current; if (!lg) return;
    lg.clearLayers();
    feeds.forEach((f) => {
      const col = LAYERS[f.layer].color, sel = f.id === selectedId;
      const m = Leaflet.circleMarker([f.lat, f.lng], { radius: sel ? 7 : 4, color: sel ? "#FFFFFF" : col, weight: sel ? 2 : 1, fillColor: col, fillOpacity: 0.9 });
      m.on("click", () => onSelect(f.id));
      m.bindTooltip(f.name, { direction: "top", opacity: 0.9 });
      m.addTo(lg);
    });
  }, [feeds, selectedId, onSelect]);
  return <div ref={elRef} style={{ width: "100%", height: "100%", background: "#0B0E13" }} />;
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return now;
}

// Animated live preview for camera layers.
function LiveViewport({ cam, now, onOpen }) {
  const canvasRef = useRef(null);
  const color = LAYERS[cam.layer].color;
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); let raf, t = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draw = () => {
      const { width: w, height: h } = canvas;
      ctx.fillStyle = "#0A0D12"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(90,100,115,0.18)"; ctx.lineWidth = 1;
      const vpx = w / 2, vpy = h * 0.42;
      for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(vpx + i * 14, vpy); ctx.lineTo(vpx + i * 90, h); ctx.stroke(); }
      for (let j = 1; j <= 7; j++) { const y = vpy + Math.pow(j / 7, 2) * (h - vpy); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let k = 0; k < 5; k++) {
        const p = ((t * (0.4 + k * 0.12) + k * 40) % 100) / 100;
        const y = vpy + Math.pow(p, 2) * (h - vpy);
        const x = vpx + (k % 2 === 0 ? 1 : -1) * (18 + p * 120); const s = 1 + p * 4;
        ctx.fillStyle = k % 3 === 0 ? color : "rgba(232,234,237,0.6)"; ctx.fillRect(x, y, s * 1.6, s);
      }
      if (!reduce) {
        const by = (t * 1.4 % (h + 60)) - 30;
        const g = ctx.createLinearGradient(0, by - 30, 0, by + 30);
        g.addColorStop(0, "rgba(55,196,106,0)"); g.addColorStop(0.5, "rgba(55,196,106,0.10)"); g.addColorStop(1, "rgba(55,196,106,0)");
        ctx.fillStyle = g; ctx.fillRect(0, by - 30, w, 60);
      }
      t += reduce ? 0 : 1; raf = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(raf);
  }, [cam, color]);
  return <Frame cam={cam} now={now} onOpen={onOpen}><canvas ref={canvasRef} width={640} height={400} className="w-full h-full block" /></Frame>;
}

// Static preview for data layers (aviation, marine, weather, space).
function DataPreview({ cam, now, onOpen }) {
  const L = LAYERS[cam.layer]; const Icon = L.icon;
  return (
    <Frame cam={cam} now={now} onOpen={onOpen}>
      <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ background:
        `radial-gradient(600px 300px at 50% 30%, ${L.color}14, transparent), #0A0D12` }}>
        <Icon size={54} color={L.color} strokeWidth={1.4} />
        <div className="font-mono" style={{ fontSize: 12, color: C.dim, letterSpacing: 1 }}>{cam.src.toUpperCase()}</div>
      </div>
    </Frame>
  );
}

function Frame({ cam, now, onOpen, children }) {
  const L = LAYERS[cam.layer];
  const ts = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  return (
    <div role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      className="group relative w-full overflow-hidden rounded-lg"
      style={{ border: `1px solid ${C.line}`, background: "#0A0D12", aspectRatio: "16 / 10", cursor: "pointer" }}>
      {children}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100"
        style={{ transition: "opacity .18s", background: "rgba(10,13,18,0.35)" }}>
        <span className="flex items-center gap-2 px-3 py-2 rounded font-mono"
          style={{ background: L.color, color: C.ink, fontSize: 12, fontWeight: 700 }}>
          <ExternalLink size={14} /> Open live in browser
        </span>
      </div>
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2"
        style={{ background: "linear-gradient(180deg, rgba(10,13,18,0.85), rgba(10,13,18,0))" }}>
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded" style={{ background: `${L.color}22` }}>
          <span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: 99, background: L.color, display: "inline-block" }} />
          <span className="font-mono" style={{ fontSize: 11, letterSpacing: 1, color: L.color }}>LIVE</span>
        </span>
        <span className="font-mono" style={{ fontSize: 11, color: C.dim }}>{cam.id}</span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-3 py-2"
        style={{ background: "linear-gradient(0deg, rgba(10,13,18,0.9), rgba(10,13,18,0))" }}>
        <div>
          <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{cam.name}</div>
          <div className="font-mono" style={{ fontSize: 11, color: C.faint }}>{cam.lat.toFixed(3)}, {cam.lng.toFixed(3)} · {cam.src}</div>
        </div>
        <div className="font-mono text-right" style={{ fontSize: 11, color: C.faint }}>{ts}</div>
      </div>
    </div>
  );
}

export default function StreetWatch() {
  const now = useClock();
  const [tab, setTab] = useState("world");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState([...layerKeys]);
  const [continent, setContinent] = useState("All");
  const [country, setCountry] = useState("All");
  const [selectedId, setSelectedId] = useState("T-LDN-01");
  const [favorites, setFavorites] = useState([]);
  const [favOnly, setFavOnly] = useState(false);
  const [userLoc, setUserLoc] = useState(null);
  const [nearMe, setNearMe] = useState(false);
  const [geoErr, setGeoErr] = useState(null);

  const toggle = (k) => setActive((a) => a.includes(k) ? a.filter((x) => x !== k) : [...a, k]);

  useEffect(() => {
    try { const v = localStorage.getItem("favorites"); if (v) setFavorites(JSON.parse(v)); } catch {}
  }, []);
  const isFav = (id) => favorites.includes(id);
  const toggleFav = (id) => setFavorites((f) => {
    const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
    try { localStorage.setItem("favorites", JSON.stringify(next)); } catch {}
    return next;
  });
  const locateMe = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGeoErr("Location unavailable on this device"); return; }
    setGeoErr("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => { setUserLoc({ lat: p.coords.latitude, lng: p.coords.longitude }); setNearMe(true); setGeoErr(null); },
      () => setGeoErr("Location permission denied"),
      { timeout: 8000, maximumAge: 60000 }
    );
  };

  const continents = useMemo(() => ["All", ...Array.from(new Set(CATALOG.map((c) => c.continent))).sort()], []);
  const countries = useMemo(() => ["All", ...Array.from(new Set(
    CATALOG.filter((c) => continent === "All" || c.continent === continent).map((c) => c.country))).sort()], [continent]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter((c) => {
      const hitQ = !q || [c.name, c.city, c.region, c.country, c.continent, c.id, LAYERS[c.layer].label].join(" ").toLowerCase().includes(q);
      const hitReg = (continent === "All" || c.continent === continent) && (country === "All" || c.country === country);
      return hitQ && hitReg && active.includes(c.layer) && (!favOnly || favorites.includes(c.id));
    });
  }, [query, active, continent, country, favOnly, favorites]);

  const selected = CATALOG.find((c) => c.id === selectedId) || results[0] || CATALOG[0];

  const grouped = useMemo(() => {
    const g = {};
    results.forEach((c) => { (g[c.continent] = g[c.continent] || []).push(c); });
    Object.values(g).forEach((arr) => arr.sort((a, b) => (favorites.includes(b.id) ? 1 : 0) - (favorites.includes(a.id) ? 1 : 0)));
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [results, favorites]);

  const nearList = useMemo(() => {
    if (!nearMe || !userLoc) return null;
    return results.map((c) => ({ ...c, distKm: distKm(userLoc.lat, userLoc.lng, c.lat, c.lng) })).sort((a, b) => a.distKm - b.distKm);
  }, [nearMe, userLoc, results]);

  const renderRow = (c) => {
    const sel = c.id === selected.id; const L = LAYERS[c.layer]; const Icon = L.icon; const fav = isFav(c.id);
    return (
      <button key={c.id} onClick={() => setSelectedId(c.id)} className="sw-row w-full text-left px-4 py-2.5 flex items-center gap-3"
        style={{ background: sel ? C.panel2 : "transparent", borderLeft: `2px solid ${sel ? L.color : "transparent"}`, borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-center flex-shrink-0 rounded" style={{ width: 30, height: 30, background: C.ink, border: `1px solid ${C.line}` }}>
          <Icon size={14} color={sel ? L.color : C.dim} />
        </div>
        <div className="min-w-0 flex-1">
          <div style={{ fontSize: 13, color: C.text, fontWeight: sel ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
          <div className="font-mono" style={{ fontSize: 10, color: C.faint }}>{c.city} · {c.country}{c.distKm != null ? ` · ${Math.round(c.distKm).toLocaleString()} km` : ""}</div>
        </div>
        <span role="button" tabIndex={0} aria-label="favorite"
          onClick={(e) => { e.stopPropagation(); toggleFav(c.id); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); toggleFav(c.id); } }}
          style={{ cursor: "pointer", display: "flex", padding: 3 }}>
          <Star size={15} color={fav ? C.amber : C.faint} fill={fav ? C.amber : "none"} />
        </span>
      </button>
    );
  };

  const bounds = useMemo(() => {
    const set = results.length ? results : CATALOG;
    return { minLat: Math.min(...set.map((c) => c.lat)), maxLat: Math.max(...set.map((c) => c.lat)),
             minLng: Math.min(...set.map((c) => c.lng)), maxLng: Math.max(...set.map((c) => c.lng)) };
  }, [results]);
  const plot = (c) => {
    const { minLat, maxLat, minLng, maxLng } = bounds;
    const nx = maxLng === minLng ? 0.5 : (c.lng - minLng) / (maxLng - minLng);
    const ny = maxLat === minLat ? 0.5 : (c.lat - minLat) / (maxLat - minLat);
    return { left: `${8 + nx * 84}%`, top: `${88 - ny * 76}%` };
  };

  const Preview = LAYERS[selected.layer].camera ? LiveViewport : DataPreview;

  return (
    <div style={{ background: C.ink, color: C.text, minHeight: "100%", fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      <style>{`
        @keyframes pdot { 0%,100%{opacity:1} 50%{opacity:.4} }
        .pulse-dot{ animation: pdot 1.4s ease-in-out infinite; }
        @keyframes ping { 0%{transform:scale(1);opacity:.55} 100%{transform:scale(2.6);opacity:0} }
        .mk-ping{ animation: ping 1.8s ease-out infinite; }
        @keyframes rsweep { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .rsweep{ transform-origin:200px 200px; animation: rsweep 4s linear infinite; }
        @keyframes rblip { 0%,100%{opacity:1} 50%{opacity:.45} }
        .rblip{ animation: rblip 2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce){ .pulse-dot,.mk-ping,.rsweep,.rblip{ animation:none !important } }
        .sw-input::placeholder{ color:${C.faint}; }
        .sw-row:hover{ background:${C.panel2} !important; }
        button:focus-visible,input:focus-visible{ outline:2px solid ${C.cyan}; outline-offset:2px; }
      `}</style>

      <header className="flex items-center justify-between px-4 md:px-6 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center rounded" style={{ width: 30, height: 30, background: C.amber }}>
            <Radio size={17} color={C.ink} strokeWidth={2.4} />
          </div>
          <div>
            <div style={{ fontWeight: 700, letterSpacing: 0.3, fontSize: 15 }}>STREETWATCH</div>
            <div className="font-mono" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>GLOBAL PUBLIC-FEED CONSOLE · DEMO</div>
          </div>
        </div>
        <nav className="flex items-center gap-1">
          {[{ k: "world", label: "World", icon: Globe, on: true }, { k: "drones", label: "Drones", icon: Plane, on: false }].map((t) => (
            <button key={t.k} onClick={() => t.on && setTab(t.k)} disabled={!t.on}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded font-mono"
              style={{ fontSize: 12, letterSpacing: 0.5, color: tab === t.k ? C.ink : t.on ? C.dim : C.faint,
                background: tab === t.k ? C.amber : "transparent", cursor: t.on ? "pointer" : "not-allowed" }}>
              <t.icon size={13} />{t.label}{!t.on && <span style={{ fontSize: 9 }}>· soon</span>}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex flex-col lg:flex-row" style={{ minHeight: "calc(100vh - 58px)" }}>
        <aside className="w-full lg:w-80 flex-shrink-0" style={{ borderRight: `1px solid ${C.line}`, background: C.panel }}>
          <div className="p-4" style={{ borderBottom: `1px solid ${C.line}` }}>
            <div className="flex items-center gap-2 px-3 rounded" style={{ background: C.ink, border: `1px solid ${C.line}`, height: 40 }}>
              <Search size={16} color={C.faint} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="sw-input bg-transparent w-full"
                placeholder="Continent, country, city, layer…" style={{ color: C.text, fontSize: 14, border: "none" }} />
              {query && <button onClick={() => setQuery("")}><X size={15} color={C.faint} /></button>}
            </div>
            <div className="font-mono mt-3 mb-1.5" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>PUBLIC LAYERS</div>
            <div className="flex flex-wrap gap-1.5">
              {layerKeys.map((k) => {
                const L = LAYERS[k]; const on = active.includes(k); const Icon = L.icon;
                return (
                  <button key={k} onClick={() => toggle(k)} className="flex items-center gap-1 px-2 py-1 rounded"
                    style={{ fontSize: 11, color: on ? C.ink : C.dim, background: on ? L.color : C.panel2,
                      border: `1px solid ${on ? L.color : C.line}` }}>
                    <Icon size={12} />{L.label}
                  </button>
                );
              })}
            </div>
            <div className="font-mono mt-3 mb-1.5" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>REGION</div>
            <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {continents.map((ct) => (
                <button key={ct} onClick={() => { setContinent(ct); setCountry("All"); }}
                  className="px-2 py-1 rounded font-mono flex-shrink-0"
                  style={{ fontSize: 11, whiteSpace: "nowrap",
                    color: continent === ct ? C.ink : C.dim,
                    background: continent === ct ? C.cyan : C.panel2,
                    border: `1px solid ${continent === ct ? C.cyan : C.line}` }}>
                  {ct === "North America" ? "N. America" : ct === "South America" ? "S. America" : ct}
                </button>
              ))}
            </div>
            <select value={country} onChange={(e) => setCountry(e.target.value)}
              className="w-full mt-2 px-2.5 rounded font-mono"
              style={{ height: 34, fontSize: 12, color: C.text, background: C.ink, border: `1px solid ${C.line}` }}>
              {countries.map((cn) => <option key={cn} value={cn} style={{ background: C.panel }}>{cn === "All" ? "All countries" : cn}</option>)}
            </select>
            {(continent !== "All" || country !== "All") && (
              <button onClick={() => { setContinent("All"); setCountry("All"); }}
                className="mt-2 font-mono flex items-center gap-1" style={{ fontSize: 10, color: C.faint }}>
                <X size={11} /> clear region
              </button>
            )}
            <div className="flex gap-1.5 mt-3">
              <button onClick={() => setFavOnly((v) => !v)} className="flex items-center gap-1 px-2.5 py-1 rounded font-mono"
                style={{ fontSize: 11, color: favOnly ? C.ink : C.dim, background: favOnly ? C.amber : C.panel2, border: `1px solid ${favOnly ? C.amber : C.line}` }}>
                <Star size={12} fill={favOnly ? C.ink : "none"} /> Favorites
              </button>
              <button onClick={() => (nearMe ? setNearMe(false) : locateMe())} className="flex items-center gap-1 px-2.5 py-1 rounded font-mono"
                style={{ fontSize: 11, color: nearMe ? C.ink : C.dim, background: nearMe ? C.cyan : C.panel2, border: `1px solid ${nearMe ? C.cyan : C.line}` }}>
                <Navigation size={12} /> Near me
              </button>
            </div>
            {geoErr === "locating" && <div className="mt-1.5 font-mono" style={{ fontSize: 10, color: C.faint }}>locating…</div>}
            {geoErr && geoErr !== "locating" && <div className="mt-1.5 font-mono" style={{ fontSize: 10, color: "#F0553B" }}>{geoErr}</div>}
          </div>

          <div style={{ maxHeight: "46vh", overflowY: "auto" }} className="lg:max-h-none">
            <div className="px-4 py-2 font-mono flex items-center justify-between" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>
              <span>{results.length} FEEDS</span><span>{nearList ? "NEAREST FIRST" : grouped.length + " REGIONS"}</span>
            </div>
            {results.length === 0 && (
              <div className="px-4 py-8 text-center" style={{ color: C.dim, fontSize: 13 }}>
                {favOnly ? "No favorites yet — tap the ☆ on any feed to save it." : "No feeds match. Try “Asia”, “Tokyo”, or enable more layers."}
              </div>
            )}
            {nearList
              ? nearList.map((c) => renderRow(c))
              : grouped.map(([continent, items]) => (
                <div key={continent}>
                  <div className="px-4 py-1.5 font-mono flex items-center gap-1.5" style={{ fontSize: 10, color: C.faint, letterSpacing: 1, background: C.ink, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
                    <Globe size={11} />{continent.toUpperCase()} · {items.length}
                  </div>
                  {items.map((c) => renderRow(c))}
                </div>
              ))}
          </div>
        </aside>

        <main className="flex-1 p-4 md:p-6 flex flex-col gap-4">
          <section className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, height: 300, flexShrink: 0 }}>
            <WorldMap feeds={results} selectedId={selected.id} onSelect={setSelectedId} />
          </section>

          <section className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 min-w-0">
              {selected.layer === "aviation"
                ? <AviationRadar center={{ lat: selected.lat, lng: selected.lng, name: selected.name, city: selected.city }} />
                : selected.layer === "marine"
                ? <MarineRadar center={{ lat: selected.lat, lng: selected.lng, name: selected.name, city: selected.city }} />
                : selected.layer === "weather"
                ? <EarthView center={{ lat: selected.lat, lng: selected.lng, name: selected.name, city: selected.city }} />
                : selected.layer === "space"
                ? <SpaceView />
                : <Preview cam={selected} now={now} onOpen={() => openLive(selected)} />}
            </div>
            <div className="w-full md:w-64 flex-shrink-0 rounded-lg p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
              <div className="font-mono flex items-center justify-between" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>
                <span className="flex items-center gap-1.5">
                  {React.createElement(LAYERS[selected.layer].icon, { size: 12, color: LAYERS[selected.layer].color })}
                  {LAYERS[selected.layer].label.toUpperCase()} FEED
                </span>
                <button onClick={() => toggleFav(selected.id)} aria-label="favorite" style={{ display: "flex" }}>
                  <Star size={16} color={isFav(selected.id) ? C.amber : C.faint} fill={isFav(selected.id) ? C.amber : "none"} />
                </button>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{selected.name}</div>
              <div className="flex items-center gap-1.5 mt-1" style={{ color: C.dim, fontSize: 13 }}>
                <MapPin size={13} color={LAYERS[selected.layer].color} /> {selected.city}, {selected.country}
              </div>
              <div className="mt-4 space-y-2 font-mono" style={{ fontSize: 12 }}>
                {[["CONTINENT", selected.continent], ["REGION", selected.region], ["SOURCE", selected.src], ["COORD", `${selected.lat.toFixed(2)}, ${selected.lng.toFixed(2)}`]].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between" style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 6 }}>
                    <span style={{ color: C.faint }}>{k}</span><span style={{ color: C.text }}>{v}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => openLive(selected)} className="mt-4 w-full flex items-center justify-center gap-2 rounded py-2.5 font-mono"
                style={{ background: LAYERS[selected.layer].color, color: C.ink, fontSize: 13, fontWeight: 700, letterSpacing: 0.4, border: "none", cursor: "pointer" }}>
                <ExternalLink size={15} /> OPEN SOURCE
              </button>
              <div className="mt-2 font-mono break-all" style={{ fontSize: 10, color: C.faint }}>↗ {resolveUrl(selected)}</div>
            </div>
          </section>

          <section className="rounded-lg p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
            <div className="font-mono flex items-center gap-1.5" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>
              <SignalHigh size={12} color={C.amber} /> PUBLISHED PUBLIC FEEDS ONLY
            </div>
            <p style={{ fontSize: 13, color: C.dim, marginTop: 8, lineHeight: 1.6 }}>
              Every layer draws only on feeds published for public viewing — official traffic authorities, open ADS-B & AIS
              networks, government/space-agency imagery, and public webcam directories. Clicking any feed hands off to the
              source's own live page in the browser, so there's no cross-origin or RTSP barrier. Private cameras of private
              spaces (homes, shop interiors, anything reachable only because it's unsecured) are deliberately excluded — viewing
              those is unauthorized access, not public data.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
