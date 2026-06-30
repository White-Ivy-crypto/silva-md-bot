const fs = require('fs');
const path = require('path');

function isOwner(senderId, ownerNumber) {
  if (!ownerNumber) return false;
  // normalize: ownerNumber like +234806... -> 234806...@c.us
  const normalized = ownerNumber.replace(/\+/g, '') + '@c.us';
  return senderId === normalized;
}

function parseNumberArg(arg) {
  // accepts +234... or 234... or 0806... returns normalized id
  if (!arg) return null;
  const digits = arg.replace(/[^0-9]/g, '');
  return digits + '@c.us';
}

module.exports = { isOwner, parseNumberArg };
