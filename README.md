# Local dev #

In order to get this working locally, you'll need node/npm/yarn installed, as well as mysql

You'll need to execute `ALTER USER '<USER>'@'localhost' IDENTIFIED WITH mysql_native_password BY '<PASSWORD>';` where `<USER>` is the user you would use for local dev (assumed to be root) and `<PASSWORD>` is the password for that user. It is not advised to use an empty password as it is then impossible to login as you cannot specify an empty password to login on the command line.

You will need to generate your own `botToken` in `.env_dev` 