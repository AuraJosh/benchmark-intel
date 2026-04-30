import axios from 'axios';

const url = 'https://startgmailwatch-eaqyycfkga-nw.a.run.app';
const data = {
    topicName: 'projects/benchmark-intel-3ea4a/topics/gmail-incoming'
};

console.log(`Triggering Watch at ${url}...`);

axios.post(url, data)
    .then(res => {
        console.log('SUCCESS!');
        console.log(res.data);
    })
    .catch(err => {
        console.error('FAILED!');
        console.error(err.response ? err.response.data : err.message);
    });
