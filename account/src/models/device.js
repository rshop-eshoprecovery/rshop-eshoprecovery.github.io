const { Schema, model } = require('mongoose');

const DeviceAttributeSchema = new Schema({
	created_date: String,
	name: String,
	value: String,
});

const DeviceAttribute = model('DeviceAttribute', DeviceAttributeSchema);

const DeviceSchema = new Schema({
	is_emulator: {
		type: Boolean,
		default: false
	},
	model: {
		type: String,
		enum: [
			'wup', // Nintendo Wii U
			'ctr', // Nintendo 3DS
			'spr', // Nintendo 3DS XL
			'ftr', // Nintendo 2DS
			'ktr', // New Nintendo 3DS
			'red', // New Nintendo 3DS XL
			'jan'  // New Nintendo 2DS XL 
		]
	},
	device_id: Number,
	device_type: Number,
	serial: String,
	device_attributes: [DeviceAttributeSchema],
	soap: {
		token: String,
		account_id: Number,
	},
	// 3DS-specific stuff
	environment: String,
	mac_hash: String,
	fcdcert_hash: String,
	linked_pids: [Number],
	access_level: {
		type: Number,
		default: 0  // 0: standard, 1: tester, 2: mod?, 3: dev
	},
	server_access_level: {
		type: String,
		default: 'prod' // everyone is in production by default
	}
});

const Device = model('Device', DeviceSchema);

module.exports = {
	DeviceSchema,
	Device,
	DeviceAttributeSchema,
	DeviceAttribute
};