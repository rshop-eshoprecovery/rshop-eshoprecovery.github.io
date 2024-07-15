// handles conntest endpoints

const express = require('express');
const subdomain = require('express-subdomain');
const logger = require('../../../logger');

// Router to handle the subdomain restriction
const conntest = express.Router();

// Setup route
logger.info('[conntest] Applying imported routes');
conntest.get('/', async (request, response) => {
	response.set('Content-Type', 'text/html');
	response.set('X-Organization', 'Nintendo');

	response.send(`
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html>
<head>
<title>HTML Page</title>
</head>
<body bgcolor="#FFFFFF">
This is test.html page
</body>
</html>
`)
});

// Main router for endpoints
const router = express.Router();

// Create subdomains
logger.info('[conntest] Creating \'conntest\' subdomain');
router.use(subdomain('conntest', conntest));

module.exports = router;