import mongoose,{Schema} from "mongoose";

const likeSchema = new Schema({
    video:{
        type: Schema.Types.ObjectId,
        ref: "Videos"
    },
    Comment:{
        type: Schema.Types.ObjectId,
        ref: "Comment"
    },
    likedBy:{
        type: Schema.Types.ObjectId,
        ref: "Users"
    },
    likedBy:{
        type: Schema.Types.ObjectId,
        ref: "Tweet"
    },
},{
    timestamps: true
}
)

export const Like = mongoose.model("Like", likeSchema)