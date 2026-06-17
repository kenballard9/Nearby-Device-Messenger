# Nearby Device Messenger

Version: 2026-06-17-direct-profile-private-messages

## New in this version

- Profile modal includes a private message textarea and Send Private Message button.
- Clicking a profile photo beside a nearby chat message opens that user's profile.
- Sending a private message opens a modal on the recipient's device.
- Recipient modal includes the incoming message, a reply textbox, and a Send Reply button.
- Private messages require both users to be signed in and connected.

## Run

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

## Notes

For testing multiple users, use separate browsers or an incognito/private window so account sessions do not overwrite each other.


## Version
2026-06-17-create-account-single-submit-dm-history

Fixes duplicate Create Account submission, correct duplicate-email messaging, and keeps scrollable private DM history.
