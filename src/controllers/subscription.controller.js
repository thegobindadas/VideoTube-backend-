import mongoose, { isValidObjectId } from "mongoose";
import { User } from "../models/user.model.js";
import { Subscription } from "../models/subscription.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";




export const checkSubscriptionStatus = asyncHandler(async (req, res) => {

    const { channelId } = req.params;

    if (!channelId) {
        throw new ApiError(400, "Channel id is required.");
    }

    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid channel id.");
    }


    // Check if the user is subscribed to the channel
    const subscription = await Subscription.findOne({
        channel: channelId,
        subscriber: req.user?._id
    });



    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { isSubscribed: !!subscription }, // Convert to boolean
                "Subscription status retrieved successfully."
            )
        );
});


export const toggleSubscriptionStatus = asyncHandler(async (req, res) => {

    const { channelId } = req.params;

    if (!channelId) {
        throw new ApiError(400, "Channel id is required.");
    }

    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid channel id.");
    }


    // Check if the subscription already exists
    const existingSubscription = await Subscription.findOne({
        channel: channelId,
        subscriber: req.user?._id
    });


    if (existingSubscription) {

        // Unsubscribe if already subscribed
        const deleteSubscription = await Subscription.deleteOne({
            _id: existingSubscription._id // Ensure you're deleting the correct subscription
        });

        if (!deleteSubscription) {
            throw new ApiError(500, "Subscription not found or already unsubscribed.");
        }



        return res.status(200).json(
            new ApiResponse(
                200,
                {isSubscribed: false},
                "Unsubscribed successfully."
            )
        );
    } else {

        // Subscribe if not already subscribed
        const subscription = await Subscription.create({
            channel: channelId,
            subscriber: req.user._id
        });

        if (!subscription) {
            throw new ApiError(500, "Internal Server Error: Subscription could not be created.");
        }



        return res.status(201).json(
            new ApiResponse(
                201,
                {
                    ...subscription,
                    isSubscribed: true
                },
                "Subscribed successfully."
            )
        );
    }
});


// controller to return subscriber list of a channel
export const getChannelSubscribersList = asyncHandler(async (req, res) => {
    
    const requestingUserId = req.user._id;
    const { userId, page = 1, limit = 10 } = req.query;
    const targetUserId = userId || requestingUserId;
    const skip = (page - 1) * limit;


    const getChannelSubscribers = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(userId)
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
            $unwind: "$subscribers"
        },
        {
            $lookup: {
                from: "users",
                localField: "subscribers.subscriber",
                foreignField: "_id",
                as: "subscriber_details"
            }
        },
        {
            $unwind: "$subscriber_details"
        },
        {
            $project: {
                _id: 0,
                subscriber: "$subscriber_details._id",
                username: "$subscriber_details.username",
                fullName: "$subscriber_details.fullName",
                avatar: "$subscriber_details.avatar"
            }
        }
    ]);
        
    if (!getChannelSubscribers?.length) {
        throw new ApiError(404, "No subscribers found for this channel.")
    }



    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                getChannelSubscribers,
                "Subscribers fetched successfully."
            )
        )
})


// controller to return subscribed channels
export const getUserSubscribedChannels = asyncHandler(async (req, res) => {

    const requestingUserId = req.user._id;
    const { userId, page = 1, limit = 10 } = req.query;
    const targetUserId = userId || requestingUserId;
    const skip = (page - 1) * limit;
  
      
    const totalSubscribedChannels = await Subscription.countDocuments({ subscriber: targetUserId });
  
      
    const subscribedChannels = await Subscription.aggregate([
        { 
            $match: { subscriber: new mongoose.Types.ObjectId(targetUserId) } 
        },
        {
            $lookup: {
                from: "users",
                localField: "channel",
                foreignField: "_id",
                as: "channelDetails"
            }
        },
        { 
            $unwind: "$channelDetails" 
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "channel",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $project: {
                _id: "$channelDetails._id",
                username: "$channelDetails.username",
                fullName: "$channelDetails.fullName",
                avatar: "$channelDetails.avatar",
                totalSubscribers: { $size: "$subscribers" }
            }
        },
        { 
            $skip: skip 
        }, 
        { 
            $limit: parseInt(limit) 
        }
    ]);
  
      
    const channelIds = subscribedChannels.map(channel => channel._id);
  
    const subscriptionsByMe = await Subscription.find({
        subscriber: requestingUserId,
        channel: { $in: channelIds }
    }).select("channel");
  
    const subscribedByMeSet = new Set(subscriptionsByMe.map(sub => sub.channel.toString()));
  
      
    const result = subscribedChannels.map(channel => ({
        ...channel,
        isSubscribedByMe: subscribedByMeSet.has(channel._id.toString())
    }));
  
  
    const totalPages = Math.ceil(totalSubscribedChannels / limit);
  
  
  
    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {
                    subscribedChannels: result,
                    currentPage: parseInt(page),
                    totalPages,
                    totalSubscribedChannels
                },
                "Fetched subscribed channels successfully"
            )
        )
});


export const searchSubscribedChannels = asyncHandler(async (req, res) => {
    try {
        const requestingUserId = req.user._id;
        const { userId, search = "", page = 1, limit = 10 } = req.query;
        const targetUserId = userId || requestingUserId;
        const skip = (page - 1) * limit;

        
        const totalSubscribedChannels = await Subscription.aggregate([
            { 
                $match: { 
                    subscriber: new mongoose.Types.ObjectId(targetUserId) 
                } 
            },
            {
                $lookup: {
                    from: "users",
                    localField: "channel",
                    foreignField: "_id",
                    as: "channelDetails"
                }
            },
            { 
                $unwind: "$channelDetails" 
            },
            {
                $match: {
                    $or: [
                        { "channelDetails.fullName": { $regex: search, $options: "i" } },
                        { "channelDetails.username": { $regex: search, $options: "i" } }
                    ]
                }
            },
            { 
                $count: "count" 
            }
        ]);

        const totalCount = totalSubscribedChannels[0]?.count || 0;

        
        const subscribedChannels = await Subscription.aggregate([
            { 
                $match: { 
                    subscriber: new mongoose.Types.ObjectId(targetUserId) 
                } 
            },
            {
                $lookup: {
                    from: "users",
                    localField: "channel",
                    foreignField: "_id",
                    as: "channelDetails"
                }
            },
            { 
                $unwind: "$channelDetails" 
            },
            {
                $match: {
                    $or: [
                        { "channelDetails.fullName": { $regex: search, $options: "i" } },
                        { "channelDetails.username": { $regex: search, $options: "i" } }
                    ]
                }
            },
            {
                $lookup: {
                    from: "subscriptions",
                    localField: "channel",
                    foreignField: "channel",
                    as: "subscribers"
                }
            },
            {
                $project: {
                    _id: "$channelDetails._id",
                    username: "$channelDetails.username",
                    fullName: "$channelDetails.fullName",
                    avatar: "$channelDetails.avatar",
                    totalSubscribers: { $size: "$subscribers" }
                }
            },
            { $skip: skip }, 
            { $limit: parseInt(limit) }
        ]);

        
        const channelIds = subscribedChannels.map(channel => channel._id);

        const subscriptionsByMe = await Subscription.find({
            subscriber: requestingUserId,
            channel: { $in: channelIds }
        }).select("channel");

        const subscribedByMeSet = new Set(subscriptionsByMe.map(sub => sub.channel.toString()));

        const result = subscribedChannels.map(channel => ({
            ...channel,
            isSubscribedByMe: subscribedByMeSet.has(channel._id.toString())
        }));

        const totalPages = Math.ceil(totalCount / limit);


        
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    {
                        subscribedChannels: result,
                        currentPage: parseInt(page),
                        totalPages,
                        totalSubscribedChannels: totalCount
                    },
                    "Searched subscribed channels successfully"
                )
            );
    } catch (error) {
        throw new ApiError(500, error.message || "Something went wrong while searching for subscribed channels");
    }
});
