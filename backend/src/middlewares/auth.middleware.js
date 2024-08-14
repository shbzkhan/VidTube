import { apiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { Users } from "../models/users.models.js";

export const verifyJWT = asyncHandler(async(req, _, next)=>{
    try {
        const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "")
        console.log(token)
    
            if (!token) {
            throw new apiError(401, "Unauthorized request")
            }
        
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
    
            const user = await Users.findById(decodedToken?._id).select("-password -refreshToken")
            
            if (!user) {
                throw new apiError(401,"Invalid Access Token")
            }
    
            req.user = user;

            next()
    } catch (error) {
        throw new apiError(401, error?.message || "Invalid Access Token")
    }
    

})