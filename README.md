# alexa-oppai-timer

Alexa skill to time and log breastfeeding.

This skill does 2 things:

- Set a timer for 10, 20 and 30 minutes to notify breastfeeding time.
- Log timestamp to Google Spreadsheet.

### How To Use

1. Create a project on Google Cloud Platform, enable Google Sheets API and create a Service Account in Credentials to generate a JSON key.
2. Rename the JSON key file to `googleCloudKey.json` and place in root of this directory
3. Create a new Google Sheet and share the sheet with the Service Account email address (`xxx@xxx.iam.gserviceaccount.com`)
4. Replace the `SPREADSHEET_KEY` variable in `index.js` with your own Google Sheet ID
5. Create a new skill in Alexa Developer Console.
6. Create a new function in AWS Lambda and set it as the endpoint in Alexa Developer Console.
7. Zip the following files of this directory to one file and upload to AWS Lambda.
   - apl.json
   - googleCloudKey.json
   - index.js
   - node_modules
   - package.json
