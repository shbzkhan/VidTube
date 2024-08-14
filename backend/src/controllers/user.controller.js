import { asyncHandler } from "../utils/asyncHandler.js";
import { apiError } from "../utils/ApiError.js";
import { Users } from "../models/users.models.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { apiResponse } from "../utils/ApiResponse.js"
import jwt  from "jsonwebtoken";
import mongoose from "mongoose";


const generateAccessAndRefreshToken = async(userId)=>{
    try {
        const user = await Users.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        user.save({validateBeforeSave: false})

        return {accessToken, refreshToken}

    } catch (error) {
        throw new apiError(500, "something went wrong while generating Access and Refresh Token")
    }
}

const userRegister = asyncHandler(async(req, res)=>{

    const {fullname, username, email, password} = req.body
    
    if (
        [fullname, username, email, password].some((field)=> field?.trim()==="")

) {
        throw new apiError(400, "All fields are required")
    }

    //check user already exist or not 
    const existUser= await Users.findOne({
        $or: [{username},{email}]
    })
    if (existUser) {
        throw new apiError(409, "user already exists")
    }

    const avatarLocalPath= req.files?.avatar[0]?.path;
    // const coverImageLocalPath= req.files?.coverImage[0]?.path;

    if (!avatarLocalPath) {
        throw new apiError(400, "avatar file is required")
    }

    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.length > 0) {
        coverImageLocalPath= req.files.coverImage[0].path;
    }


    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!avatar) {
        throw new apiError(400, "avatar file is required")
    }

    const user = await Users.create({
        fullname,
        email,
        password,
        username: username.toLowerCase(),
        avatar: avatar.url,
        coverImage: coverImage?.url || ""
    })

    const createdUser= await Users.findById(user._id).select(
        "-password -refreshToken"
    )

    if (!createdUser) {
        throw new apiError(500, "something went wrong while registering the user")
    }

    return res
    .status(201)
    .json(
        new apiResponse(200, createdUser, "user register successfully")
    )
})

// Login form
const userLogin = asyncHandler(async(req, res)=>{
    const {username, email, password} = req.body

    if (!(username || email)) {
        throw new apiError(400, "user and email are required")
    }

    const user =await Users.findOne({
        $or: [{username},{email}] 
    })
    
    if (!user) {
        throw new apiError(404, "user not exist")
    }

    const passwordValid = await user.isPasswordCorrect(password)
    if (!passwordValid) {
        throw new apiError(405, "password is incorrect")
    }

    const {accessToken, refreshToken}= await generateAccessAndRefreshToken(user._id)

        const loggedInUser= await Users.findById(user._id).select(
        "-password -refreshToken"
    )

    const options ={
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new apiResponse(200,
            {
                user: loggedInUser, refreshToken, accessToken
            },
            "User logged in successfully"
        )
        
    )
})

const userLogout = asyncHandler(async(req, res)=>{
    await Users.findByIdAndUpdate(
        req.user._id,
        {
            $unset:{
                refreshToken: 1
            }
            
        },
        {
            new: true
        }
    )

    const options ={
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(
        new apiResponse(200, {}, "User logged Out")
    )
})

const refreshAccessToken = asyncHandler(async(req, res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (!incomingRefreshToken) {
        throw new apiError(401, "Unauthorized Refresh Token")
    }
    
    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
    
        if (!decodedToken) {
            throw new apiError(402, "Invalid Refresh token")
        }
    
        const user = await Users.findById(decodedToken._id)
    
        if (!user) {
            throw new apiError(403, "Invalid Refresh Token")
        }
    
        if (incomingRefreshToken !== user?.refreshToken) {
            throw new apiError(403, "Refresh Token is expired or used")
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshToken(user._id)
    
        const options ={
            httpOnly: true,
            secure: true
        }
    
        return res
        .status(203)
        .cookie("accessToken",accessToken, options)
        .cookie("refreshToken",newRefreshToken, options)
        .json(
            new apiResponse(
                203,
                {
                    accessToken, refreshToken: newRefreshToken
                },
                "Access Token Refreshed"
            )
        )
    } catch (error) {
        throw new apiError(402, error?.message || "Invalid Refresh Token")
    }
})

const changeCurrentPassword = asyncHandler(async(req, res)=>{
    const {oldPassword, newPassword} = req.body
    console.log(oldPassword, newPassword);
     if (!req.user || !req.user._id) {
        throw new apiError(401, "User not authenticated");
    }
    const user = await Users.findById(req.user?._id)
    console.log(user);
     if (!user) {
        throw new apiError(404, "User not found");
    }

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)
 
    if (!isPasswordCorrect) {
        throw new apiError(405, "Old Password is incorrect")
        
    }

    user.password = newPassword

    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json(
        new apiResponse(200, {}, "Password changed successfully")
    )
})

const getCurrentUser = asyncHandler(async(req, res)=>{

   return res
    .status(200)
    .json(
        new apiResponse(
        200,
        req.user,
        "User fetched successfully"
    ))
})

const updateUserProfile = asyncHandler(async(req, res)=>{
    const {fullname, email} = req.body
    if(!(fullname || email)){
        throw new apiError(400, "fullname or email are required")
    }

    const user = await Users.findByIdAndUpdate(
        req.user?._id,
        {
            fullname,
            email: email
        },
        {
            new: true
        }
    ).select("-password")

    return res
    .status(200)
    .json(
        new apiResponse(200, user, "User Profile updated successfully")
    )
})

const  updateUserAvatar = asyncHandler(async(req, res)=>{
    const avatarLocalPath = await req.file?.path
    if (!avatarLocalPath) {
        throw new apiError(400, "avatar file is missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    if (!avatar.url) {
        throw new apiError(400, "Error while uploading on avatar")
        
    }

    const user = await Users.findByIdAndUpdate(
        req.user?._id,
        {
            avatar: avatar.url
        },
        {
            new: true
        }
    ).select("-password")

    return res
    .status(200)
    .json(
        new apiResponse(200, user, "Avatar updated successfully")
    )

})
const  updateUserCoverImage = asyncHandler(async(req, res)=>{
    const coverImageLocalPath = await req.file?.path
    if (!coverImageLocalPath) {
        throw new apiError(400, "Cover Image file is missing")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if (!coverImage.url) {
        throw new apiError(400, "Error while uploading on Cover Image")
        
    }

    const user = await Users.findByIdAndUpdate(
        req.user?._id,
        {
            coverImage: coverImage.url
        },
        {
            new: true
        }
    ).select("-password")

    return res
    .status(200)
    .json(
        new apiResponse(200, user, "Cover Image updated successfully")
    )

})

const getUserChannelProfile = asyncHandler( async(req, res)=>{
    const {username} = req.params

    if (!username.trim()) {
        throw new apiError(400, "username missing")
    }

    const channel = await Users.aggregate([
        {
            $match: {
                username: username?.toLowerCase
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount:{
                    $size: "$subscribers"
                },
                subscribersCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed:{
                    $cond: {
                        if: {$in: [req.user?._id,"$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project:{
                fullname: 1,
                username: 1,
                avatar: 1,
                coverImage: 1,
                subscribersCount: 1,
                subscribersCount: 1,
                isSubscribed: 1

            }
        }
    ])

    if (!channel?.length) {
        throw new apiError(401, "channel does not exist")
    }

    return res
    .status(200)
    .json(
        new apiResponse(200, channel[0], "User Channel fetched successfully")
    )
})

const getWatchHistory = asyncHandler(async(req, res)=>{
    const user = await Users.aggregate([
        {
            $match:{
                _id: new mongoose.Types.ObjectId(req.user?._id)
            }
        },
        {
            $lookup:{
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline:[
                    {
                        $lookup:{
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline:[
                                {
                                    $project:{
                                        fullname: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },{
                        $addFields:{
                            owner:{
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
    .status(200)
    .json(
        new apiResponse(200, user[0].watchHistory, "watch History fetch successfully")
    )
})

export {
    userRegister,
    userLogin,
    userLogout,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateUserProfile,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
    
}