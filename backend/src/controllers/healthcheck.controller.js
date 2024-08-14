// import {apiError} from "../utils/ApiError.js"
import {apiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"


const healthcheck = asyncHandler(async (req, res) => {
    //TODO: build a healthcheck response that simply returns the OK status as json with a message
    return res
    .status(200)
    .json(
        new apiResponse(200, {message: "Everything is O.K"},"Ok")
    )
})

export {
    healthcheck
    }
    