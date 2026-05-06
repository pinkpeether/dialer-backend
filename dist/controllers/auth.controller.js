"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.getProfile = exports.login = exports.register = void 0;
const AuthService = __importStar(require("../services/auth.service"));
const response_1 = require("../utils/response");
const register = async (req, res, next) => {
    try {
        const result = await AuthService.registerUser(req.body);
        return (0, response_1.sendSuccess)(res, result, 'User registered successfully', 201);
    }
    catch (err) {
        return next(err);
    }
};
exports.register = register;
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const result = await AuthService.loginUser(email, password);
        return (0, response_1.sendSuccess)(res, result, 'Login successful');
    }
    catch (err) {
        return next(err);
    }
};
exports.login = login;
const getProfile = async (req, res, next) => {
    try {
        const user = await AuthService.getProfile(req.user.id);
        return (0, response_1.sendSuccess)(res, user, 'Profile fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getProfile = getProfile;
const logout = async (req, res, next) => {
    try {
        await AuthService.logoutUser(req.user.id);
        return (0, response_1.sendSuccess)(res, null, 'Logged out successfully');
    }
    catch (err) {
        return next(err);
    }
};
exports.logout = logout;
//# sourceMappingURL=auth.controller.js.map