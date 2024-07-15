const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const joi = require('joi');
const util = require('./util');
const { PNID } = require('./models/pnid');
const { Server } = require('./models/server');
const logger = require('../logger');
const { config } = require('./config-manager');
const { connection_string, options } = config.mongoose;

// TODO: Extend this later with more settings
const discordConnectionSchema = joi.object({
	id: joi.string()
});

let connection;

async function connect() {
	await mongoose.connect(connection_string, options);

	connection = mongoose.connection;
	connection.on('error', console.error.bind(console, 'connection error:'));

	module.exports.connection = connection;
}

function verifyConnected() {
	if (!connection) {
		throw new Error('Cannot make database requets without being connected');
	}
}

async function getUserByUsername(username) {
	verifyConnected();

	if (typeof username !== 'string') {
		return null;
	}

	const user = await PNID.findOne({
		usernameLower: username.toLowerCase()
	});

	return user;
}

async function getUserByPID(pid) {
	verifyConnected();

	const user = await PNID.findOne({
		pid
	});

	return user;
}

async function getUserByEmailAddress(email) {
	verifyConnected();

	const user = await PNID.findOne({
		'email.address': new RegExp(email, 'i') // * Ignore case
	});

	return user;
}

async function doesUserExist(username) {
	verifyConnected();

	return !!await getUserByUsername(username);
}

async function getUserBasic(token) {
	verifyConnected();

	// Wii U sends Basic auth as `username password`, where the password may not have spaces
	// This is not to spec, but that is the consoles fault not ours
	const [username, password] = Buffer.from(token, 'base64').toString().split(' ');
	const user = await getUserByUsername(username);

	if (!user) {
		return null;
	}

	const hashedPassword = util.nintendoPasswordHash(password, user.pid);

	if (!bcrypt.compareSync(hashedPassword, user.password)) {
		return null;
	}

	return user;
}

async function getUserBearer(token) {
	verifyConnected();

	try {
		const decryptedToken = await util.decryptToken(Buffer.from(token, 'base64'));
		const unpackedToken = util.unpackToken(decryptedToken);

		const user = await getUserByPID(unpackedToken.pid);

		if (user) {
			const expireTime = Math.floor((Number(unpackedToken.expire_time) / 1000));

			if (Math.floor(Date.now() / 1000) > expireTime) {
				return null;
			}
		}

		return user;
	} catch (error) {
		// TODO: Handle error
		logger.error(error);
		return null;
	}
}

async function getUserProfileJSONByPID(pid) {
	verifyConnected();

	const user = await getUserByPID(pid);
	const device = user.get('devices')[0]; // Just grab the first device
	let device_attributes;

	if (device) {
		device_attributes = device.get('device_attributes').map(({name, value, created_date}) => {
			const deviceAttributeDocument = {
				name,
				value
			};

			if (created_date) {
				deviceAttributeDocument.created_date = created_date;
			}

			return {
				device_attribute: deviceAttributeDocument
			};
		});
	}

	const userObject = {
		//accounts: {}, We need to figure this out, no idea what these values mean or what they do
		active_flag: user.get('flags.active') ? 'Y' : 'N',
		birth_date: user.get('birthdate'),
		country: user.get('country'),
		create_date: user.get('creation_date'),
		device_attributes: device_attributes,
		gender: user.get('gender'),
		language: user.get('language'),
		updated: user.get('updated'),
		marketing_flag: user.get('flags.marketing') ? 'Y' : 'N',
		off_device_flag: user.get('flags.off_device') ? 'Y' : 'N',
		pid: user.get('pid'),
		email: {
			address: user.get('email.address'),
			id: user.get('email.id'),
			parent: user.get('email.parent') ? 'Y' : 'N',
			primary: user.get('email.primary') ? 'Y' : 'N',
			reachable: user.get('email.reachable') ? 'Y' : 'N',
			type: 'DEFAULT',
			updated_by: 'USER', // Can also be INTERNAL WS, don't know the difference
			validated: user.get('email.validated') ? 'Y' : 'N'
		},
		mii: {
			status: 'COMPLETED',
			data: user.get('mii.data').replace(/(\r\n|\n|\r)/gm, ''),
			id: user.get('mii.id'),
			mii_hash: user.get('mii.hash'),
			mii_images: {
				mii_image: {
					// Images MUST be loaded over HTTPS or console ignores them
					// Bunny CDN is the only CDN which seems to support TLS 1.0/1.1 (required)
					cached_url: `${config.cdn.base_url}/mii/${user.pid}/standard.tga`,
					id: user.get('mii.image_id'),
					url: `${config.cdn.base_url}/mii/${user.pid}/standard.tga`,
					type: 'standard'
				}
			},
			name: user.get('mii.name'),
			primary: user.get('mii.primary') ? 'Y' : 'N',
		},
		region: user.get('region'),
		tz_name: user.get('timezone.name'),
		user_id: user.get('username'),
		utc_offset: user.get('timezone.offset')
	};

	if (user.get('email.validated')) {
		userObject.email.validated_date = user.get('email.validated_date');
	}

	return userObject;
}

function getServer(gameServerId, accessMode) {
	return Server.findOne({
		game_server_id: gameServerId,
		access_mode: accessMode,
	});
}

function getServerByTitleId(titleId, accessMode) {
	return Server.findOne({
		title_ids: titleId,
		access_mode: accessMode,
	});
}

async function addUserConnection(pnid, data, type) {
	if (type === 'discord') {
		return await addUserConnectionDiscord(pnid, data);
	}
}

async function addUserConnectionDiscord(pnid, data) {
	const valid = discordConnectionSchema.validate(data);

	if (valid.error) {
		return {
			app: 'api',
			status: 400,
			error: 'Invalid or missing connection data'
		};
	}

	await PNID.updateOne({ pid: pnid.get('pid') }, {
		$set: {
			'connections.discord.id': data.id
		}
	});

	return {
		app: 'api',
		status: 200
	};
}

async function removeUserConnection(pnid, type) {
	// Add more connections later?
	if (type === 'discord') {
		return await removeUserConnectionDiscord(pnid);
	}
}

async function removeUserConnectionDiscord(pnid) {
	await PNID.updateOne({ pid: pnid.get('pid') }, {
		$set: {
			'connections.discord.id': ''
		}
	});

	return {
		app: 'api',
		status: 200
	};
}

module.exports = {
	connect,
	connection,
	getUserByUsername,
	getUserByPID,
	getUserByEmailAddress,
	doesUserExist,
	getUserBasic,
	getUserBearer,
	getUserProfileJSONByPID,
	getServer,
	getServerByTitleId,
	addUserConnection,
	removeUserConnection,
};