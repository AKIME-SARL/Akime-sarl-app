# Free website uptime monitoring

To avoid GitHub Actions usage charges, use an external monitor instead of
running a scheduled GitHub Actions job.

UptimeRobot's Free plan currently includes checks every five minutes and up to
50 monitors. It can notify you by email or through its free mobile app. The
Telegram integration is listed for paid plans; WhatsApp and automatic phone
calls are not included in this free setup.

## Setup

1. Create a free account at [UptimeRobot](https://uptimerobot.com/). The Free
   plan does not require a credit card.
2. Verify your email address and install the UptimeRobot app on your phone if
   you want push notifications.
3. In the dashboard, add a new **HTTP(s)** monitor.
4. Set the friendly name to `A-KIME website` and the URL to
   `https://a-kime.com/`.
5. Keep the monitoring interval at five minutes and save the monitor.
6. Configure your verified email address and/or mobile push notification as
   alert contacts, then select them for this monitor.
7. Test the monitor from the dashboard and confirm that a test alert reaches
   you.

For the admin site, optionally add a second HTTP(s) monitor for
`https://admin-pro-a-kime.com/admin/login`.

The free plan does not place voice calls, and its Telegram integration requires
a paid plan. Avoid entering GitHub, Hostinger, database, or other application
passwords into the monitoring service. UptimeRobot only needs the public URL.
Plan features and limits can change; confirm the current details on its
[pricing page](https://uptimerobot.com/pricing/).
