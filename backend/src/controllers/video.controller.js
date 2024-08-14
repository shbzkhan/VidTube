import mongoose, {isValidObjectId} from "mongoose"
import {Videos} from "../models/videos.models.js"
import {Users} from "../models/users.models.js"
import {apiError} from "../utils/ApiError.js"
import { apiResponse } from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import { Like } from "../models/like.models.js";
import {
    uploadOnCloudinary,
    deleteOnCloudinary
} from "../utils/cloudinary.js";


// get all videos based on query, sort, pagination
const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;
    console.log(userId);
    const pipeline = [];


    if (query) {
        pipeline.push({
            $search: {
                index: "search-videos",
                text: {
                    query: query,
                    path: ["title", "description"] //search only on title, desc
                }
            }
        });
    }

    if (userId) {
        if (!isValidObjectId(userId)) {
            throw new apiError(400, "Invalid userId");
        }

        pipeline.push({
            $match: {
                owner: new mongoose.Types.ObjectId(userId)
            }
        });
    }

    // fetch videos only that are set isPublished as true
    pipeline.push({ $match: { isPublished: true } });

    //sortBy can be views, createdAt, duration
    //sortType can be ascending(-1) or descending(1)
    if (sortBy && sortType) {
        pipeline.push({
            $sort: {
                [sortBy]: sortType === "asc" ? 1 : -1
            }
        });
    } else {
        pipeline.push({ $sort: { createdAt: -1 } });
    }

    pipeline.push(
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "ownerDetails",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            "avatar.url": 1
                        }
                    }
                ]
            }
        },
        {
            $unwind: "$ownerDetails"
        }
    )

    const videoAggregate = Videos.aggregate(pipeline);

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
    };

    const video = await Videos.aggregatePaginate(videoAggregate, options);

    return res
        .status(200)
        .json(new apiResponse(200, video, "Videos fetched successfully"));
});

// get video, upload to cloudinary, create video
const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body;
    
    if ([title, description].some((field) => field?.trim() === "")) {
        throw new apiError(400, "All fields are required");
    }

    const videoFileLocalPath = req.files?.videoFile[0].path;
    const thumbnailLocalPath = req.files?.thumbnail[0].path;

    if (!videoFileLocalPath) {
        throw new apiError(400, "videoFileLocalPath is required");
    }

    if (!thumbnailLocalPath) {
        throw new apiError(400, "thumbnailLocalPath is required");
    }

    const videoFile = await uploadOnCloudinary(videoFileLocalPath);
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);

    if (!videoFile) {
        throw new apiError(400, "Videos file not found");
    }

    if (!thumbnail) {
        throw new apiError(400, "Thumbnail not found");
    }

    const video = await Videos.create({
        title,
        description,
        duration: videoFile.duration,
        videoFile: {
            url: videoFile.url,
            public_id: videoFile.public_id
        },
        thumbnail: {
            url: thumbnail.url,
            public_id: thumbnail.public_id
        },
        owner: req.user?._id,
        isPublished: false
    });

    const videoUploaded = await Videos.findById(video._id);

    if (!videoUploaded) {
        throw new apiError(500, "videoUpload failed please try again !!!");
    }

    return res
        .status(200)
        .json(new apiResponse(200, video, "Videos uploaded successfully"));
});

// get video by id
const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    // let userId = req.body;
    
    // userId = new mongoose.Types.ObjectId(userId)
    if (!isValidObjectId(videoId)) {
        throw new apiError(400, "Invalid videoId");
    }

    if (!isValidObjectId(req.user?._id)) {
        throw new apiError(400, "Invalid userId");
    }

    const video = await Videos.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(videoId)
            }
        },
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likes"
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $lookup: {
                            from: "subscriptions",
                            localField: "_id",
                            foreignField: "channel",
                            as: "subscribers"
                        }
                    },
                    {
                        $addFields: {
                            subscribersCount: {
                                $size: "$subscribers"
                            },
                            isSubscribed: {
                                $cond: {
                                    if: {
                                        $in: [
                                            req.user?._id,
                                            "$subscribers.subscriber"
                                        ]
                                    },
                                    then: true,
                                    else: false
                                }
                            }
                        }
                    },
                    {
                        $project: {
                            username: 1,
                            "avatar.url": 1,
                            subscribersCount: 1,
                            isSubscribed: 1
                        }
                    }
                ]
            }
        },
        {
            $addFields: {
                likesCount: {
                    $size: "$likes"
                },
                owner: {
                    $first: "$owner"
                },
                isLiked: {
                    $cond: {
                        if: {$in: [req.user?._id, "$likes.likedBy"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                "videoFile.url": 1,
                title: 1,
                description: 1,
                views: 1,
                createdAt: 1,
                duration: 1,
                comments: 1,
                owner: 1,
                likesCount: 1,
                isLiked: 1
            }
        }
    ]);

    if (!video) {
        throw new apiError(500, "failed to fetch video");
    }

    // increment views if video fetched successfully
    await Videos.findByIdAndUpdate(videoId, {
        $inc: {
            views: 1
        }
    });

    // add this video to user watch history
    await Users.findByIdAndUpdate(req.user?._id, {
        $addToSet: {
            watchHistory: videoId
        }
    });

    return res
        .status(200)
        .json(
            new apiResponse(200, video[0], "video details fetched successfully")
        );
});

// update video details like title, description, thumbnail
const updateVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body;
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new apiError(400, "Invalid videoId");
    }

    if (!(title && description)) {
        throw new apiError(400, "title and description are required");
    }

    const video = await Videos.findById(videoId);

    if (!video) {
        throw new apiError(404, "No video found");
    }

    if (video?.owner.toString() !== req.user?._id.toString()) {
        throw new apiError(
            400,
            "You can't edit this video as you are not the owner"
        );
    }

    //deleting old thumbnail and updating with new one
    const thumbnailToDelete = video.thumbnail.public_id;

    const thumbnailLocalPath = req.file?.path;

    if (!thumbnailLocalPath) {
        throw new apiError(400, "thumbnail is required");
    }

    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);

    if (!thumbnail) {
        throw new apiError(400, "thumbnail not found");
    }

    const updatedVideo = await Videos.findByIdAndUpdate(
        videoId,
        {
            $set: {
                title,
                description,
                thumbnail: {
                    public_id: thumbnail.public_id,
                    url: thumbnail.url
                }
            }
        },
        { new: true }
    );

    if (!updatedVideo) {
        throw new apiError(500, "Failed to update video please try again");
    }

    if (updatedVideo) {
        await deleteOnCloudinary(thumbnailToDelete);
    }

    return res
        .status(200)
        .json(new apiResponse(200, updatedVideo, "Videos updated successfully"));
});

// delete video
const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new apiError(400, "Invalid videoId");
    }

    const video = await Videos.findById(videoId);

    if (!video) {
        throw new apiError(404, "No video found");
    }

    if (video?.owner.toString() !== req.user?._id.toString()) {
        throw new apiError(
            400,
            "You can't delete this video as you are not the owner"
        );
    }

    const videoDeleted = await Videos.findByIdAndDelete(video?._id);

    if (!videoDeleted) {
        throw new apiError(400, "Failed to delete the video please try again");
    }

    await deleteOnCloudinary(video.thumbnail.public_id); // video model has thumbnail public_id stored in it->check videoModel
    await deleteOnCloudinary(video.videoFile.public_id, "video"); // specify video while deleting video

    // delete video likes
    await Like.deleteMany({
        video: videoId
    })

     // delete video comments
    await Comment.deleteMany({
        video: videoId,
    })
    
    return res
        .status(200)
        .json(new apiResponse(200, {}, "Videos deleted successfully"));
});

// toggle publish status of a video
const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new apiError(400, "Invalid videoId");
    }

    const video = await Videos.findById(videoId);

    if (!video) {
        throw new apiError(404, "Videos not found");
    }

    if (video?.owner.toString() !== req.user?._id.toString()) {
        throw new apiError(
            400,
            "You can't toogle publish status as you are not the owner"
        );
    }

    const toggledVideoPublish = await Videos.findByIdAndUpdate(
        videoId,
        {
            $set: {
                isPublished: !video?.isPublished
            }
        },
        { new: true }
    );

    if (!toggledVideoPublish) {
        throw new apiError(500, "Failed to toogle video publish status");
    }

    return res
        .status(200)
        .json(
            new apiResponse(
                200,
                { isPublished: toggledVideoPublish.isPublished },
                "Videos publish toggled successfully"
            )
        );
});

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}