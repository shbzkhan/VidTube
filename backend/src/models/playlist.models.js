
import mongoose,{Schema} from "mongoose";

const playlistSchema = new Schema({
    video:{
        type: Schema.Types.ObjectId,
        ref: "Videos"
    },
    owner:{
        type: Schema.Types.ObjectId,
        ref: "Users"
    },
    name:{
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    }
},{
    timestamps: true
}
)

export const Playlist = mongoose.model("Playlist", playlistSchema)