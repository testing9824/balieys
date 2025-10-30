# 🛜 Raspberry Pi Wi-Fi Setup (via nmcli)

Easily configure Wi-Fi on your Raspberry Pi (Zero W, 3, 4, etc.) using simple `nmcli` commands.  
Perfect for headless setup or 24x7 Raspberry Pi servers.

---

## ⚙️ Commands (Copy & Paste)

```bash
# 1️⃣ List available Wi-Fi networks
sudo nmcli dev wifi list

# 2️⃣ Delete old connection (if already exists)
sudo nmcli connection delete Ludo

# 3️⃣ Add a new Wi-Fi connection
sudo nmcli connection add type wifi ifname wlan0 con-name Ludo ssid "Ludo"

# 4️⃣ Set Wi-Fi password
sudo nmcli connection modify Ludo wifi-sec.key-mgmt wpa-psk
sudo nmcli connection modify Ludo wifi-sec.psk "1234567899"

# 5️⃣ Connect to Wi-Fi
sudo nmcli connection up Ludo

# 6️⃣ Verify connection
nmcli -t -f active,ssid dev wifi
ip addr show wlan0
ping -c 4 google.com
