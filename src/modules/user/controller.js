// module imports
import { isValidObjectId } from "mongoose";

// file imports
import ElementModel from "./model.js";
import FilesRemover from "../../utils/files-remover.js";
import * as profileController from "../profile/controller.js";
import { USER_TYPES } from "../../configs/enum.js";
import { ErrorHandler } from "../../middlewares/error-handler.js";

// destructuring assignments
const { ADMIN } = USER_TYPES;

/**
 * @description Add element
 * @param {Object} elementObj element data
 * @returns {Object} element data
 */
export const addElement = async (elementObj) => {
  const { password } = elementObj;
  const user = await ElementModel.create(elementObj);
  await user.setPassword(password);
  return user;
};

/**
 * @description Update element data
 * @param {String} element element id
 * @param {Object} elementObj element data
 * @returns {Object} element data
 */
export const updateElementById = async (user, userObj) => {
  if (!user) throw new ErrorHandler("Please enter user id!", 400);
  if (!isValidObjectId(user))
    throw new ErrorHandler("Please enter valid user id!", 400);
  const {
    password,
    firstName,
    lastName,
    image,
    profile,
    coordinates,
    fcm,
    shallRemoveFCM,
    device,
  } = userObj;

  if (!user) throw new ErrorHandler("Please enter user id!", 400);
  if (!isValidObjectId(user))
    throw new ErrorHandler("Please enter valid user id!", 400);

  let userExists = await ElementModel.findById(user);
  if (!userExists) throw new ErrorHandler("Element not found!", 404);

  if (password) {
    await userExists.setPassword(password);
    delete userObj.password;
  }
  if (fcm) {
    if (fcm?.token && fcm?.device) {
      let alreadyExists = false;
      userExists.fcms.forEach((element) => {
        if (element.device === fcm.device) {
          alreadyExists = true;
          element.token = fcm.token;
        }
      });
      if (!alreadyExists)
        userExists.fcms.push({ device: fcm.device, token: fcm.token });
    } else
      throw new ErrorHandler("Please enter FCM token and device both!", 400);
  }
  if (shallRemoveFCM)
    if (device)
      userExists.fcms = userExists.fcms.filter(
        (element) => element?.device !== device
      );
  if (firstName || lastName)
    userExists.name = (firstName || "") + " " + (lastName || "");
  if (image) {
    if (userExists.image) new FilesRemover().remove([userExists.image]);
    userExists.image = image;
  }
  if (coordinates) {
    if (coordinates?.length === 2)
      userExists.location.coordinates = coordinates;
    else
      throw new ErrorHandler(
        "Please enter location longitude and latitude both!",
        400
      );
  }
  if (profile)
    if (await profileController.checkElementExistence({ _id: profile })) {
      userExists.profile = profile;
    } else throw new ErrorHandler("Profile not found!", 404);

  userExists = { ...userExists._doc, ...userObj };
  userExists = await ElementModel.findByIdAndUpdate(
    userExists._id,
    userExists,
    {
      new: true,
    }
  ).select("-createdAt -updatedAt -__v");
  if (!userExists) throw new ErrorHandler("user not found!", 404);
  return userExists;
};

/**
 * @description Update element data
 * @param {Object} query element data
 * @param {Object} elementObj element data
 * @returns {Object} element data
 */
export const updateElement = async (query, elementObj) => {
  if (!query || Object.keys(query).length === 0)
    throw new ErrorHandler("Please enter query!", 400);
  const elementExists = await ElementModel.findOneAndUpdate(query, elementObj, {
    new: true,
  });
  if (!elementExists) throw new ErrorHandler("element not found!", 404);
  return elementExists;
};

/**
 * @description Delete element
 * @param {String} element element id
 * @returns {Object} element data
 */
export const deleteElementById = async (element) => {
  if (!element) throw new ErrorHandler("Please enter element id!", 400);
  if (!isValidObjectId(element))
    throw new ErrorHandler("Please enter valid element id!", 400);
  const elementExists = await ElementModel.findByIdAndDelete(element);
  if (!elementExists) throw new ErrorHandler("element not found!", 404);
  return elementExists;
};

/**
 * @description Get element
 * @param {String} element element id
 * @returns {Object} element data
 */
export const getElementById = async (element) => {
  if (!element) throw new ErrorHandler("Please enter element id!", 400);
  if (!isValidObjectId(element))
    throw new ErrorHandler("Please enter valid element id!", 400);
  const elementExists = await ElementModel.findById(element).select(
    "-createdAt -updatedAt -__v"
  );
  if (!elementExists) throw new ErrorHandler("element not found!", 404);
  return elementExists;
};

/**
 * @description Get element
 * @param {Object} params element data
 * @returns {Object} element data
 */
export const getElement = async (params) => {
  const { user, email, phone, googleId, facebookId } = params;
  const query = {};
  if (user) query._id = user;
  if (email) query.email = email;
  if (googleId) query.googleId = googleId;
  if (facebookId) query.facebookId = facebookId;
  if (phone) query.phone = phone;
  if (Object.keys(query).length === 0) query._id = null;

  let userExists = await ElementModel.findOne(query).select(
    "-createdAt -updatedAt -__v -fcms"
  );
  if (userExists)
    if (userExists?.profile)
      userExists = await userExists.populate(userExists.type);
  return userExists;
};

/**
 * @description Get elements
 * @param {Object} params elements fetching parameters
 * @returns {Object[]} elements data
 */
export const getElements = async (params) => {
  const { type, user } = params;
  let { page, limit, keyword } = params;
  page = page - 1 || 0;
  limit = limit || 10;
  const query = {};

  if (type) query.type = type;
  else query.type = { $ne: ADMIN };
  if (user) query._id = { $ne: user };
  if (keyword) {
    keyword = keyword.trim();
    if (keyword !== "")
      query.$or = [
        { email: { $regex: keyword, $options: "i" } },
        { name: { $regex: keyword, $options: "i" } },
      ];
  }
  const [result] = await ElementModel.aggregate([
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $project: { password: 0, createdAt: 0, updatedAt: 0, __v: 0 } },
    {
      $facet: {
        totalCount: [{ $count: "totalCount" }],
        data: [{ $skip: page * limit }, { $limit: limit }],
      },
    },
    { $unwind: "$totalCount" },
    {
      $project: {
        totalCount: "$totalCount.totalCount",
        totalPages: { $ceil: { $divide: ["$totalCount.totalCount", limit] } },
        data: 1,
      },
    },
  ]);
  return { data: [], totalCount: 0, totalPages: 0, ...result };
};

/**
 * @description Check element existence
 * @param {Object} query element data
 * @returns {Boolean} element existence status
 */
export const checkElementExistence = async (query) => {
  if (!query || Object.keys(query).length === 0)
    throw new ErrorHandler("Please enter query!", 400);
  return await ElementModel.exists(query);
};

/**
 * @description Get user profile
 * @param {Object} params user fetching parameters
 * @returns {Object} user data
 */
export const getUserProfile = async (params) => {
  const { user, device } = params;
  const userExists = await ElementModel.findById(user).select(
    "-createdAt -updatedAt -__v"
  );
  userExists.fcms.forEach((element) => {
    if (element?.device === device) userExists._doc.fcm = element?.token;
  });
  delete userExists._doc.fcms;
  return userExists;
};
