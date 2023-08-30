var express = require("express");
var router = express.Router();

require("../models/connection");
const User = require("../models/users");
const bcrypt = require("bcrypt");
const uid2 = require("uid2");
const { format } = require("date-fns");

// Import des fonctions
const { checkBody } = require("../modules/checkBody");
const { checkTokenSession } = require("../modules/checkUser");
const { parseTrip } = require("../modules/parseTrip");

// On récupère la date d'aujourd'hui sans les heures
const dateNow = new Date(format(new Date(), "yyyy-MM-dd"));

// Route pour l'inscription (signup)
router.post("/signup", async (req, res) => {
  if (!checkBody(req.body, ["username", "email", "password"])) {
    return res.json({ result: false, error: "Missing or empty fields" });
  }

  // On vérifie que l'utilisateur n'est pas déjà enregistré
  const existingUser = await User.findOne({ email: { $regex: req.body.email, $options: "i" } });
  // Si l'utilisateur est déjà enregistré et qu'il est active, on renvoie une erreur
  let savedUser = {};
  if (existingUser && existingUser.active) {
    return res.json({ result: false, error: "This email address already exists" });
  }
  // Si l'utilisateur est enregistré mais non actif (il a été ajouté par un ami)
  // else if (existingUser && !existingUser.active) {
  //   const hash = bcrypt.hashSync(req.body.password, 10);
  //   const updateUser = {
  //     tokenSession: uid2(32),
  //     username: req.body.username,
  //     email: req.body.email,
  //     password: hash,
  //     friends: [],
  //     active: true,
  //   };
  //   savedUser = await User.findByIdAndUpdate(existingUser._id, { ...updateUser });
  // }

  // Si l'utilisateur est nouveau
  else {
    const hash = bcrypt.hashSync(req.body.password, 10);
    const newUser = new User({
      tokenUser: uid2(32),
      tokenSession: uid2(32),
      username: req.body.username,
      email: req.body.email,
      password: hash,
      friends: [],
      active: true,
    });
    savedUser = await newUser.save();
  }
  await savedUser.populate("trips");
  await savedUser.populate([{ path: "trips.user" }, { path: "trips.participants" }]);

  // On filtre la date pour afficher seulement les Trip dont la date de fin est égale ou après aujourd'hui
  const tripsBrut = savedUser.trips.filter((trip) => new Date(trip.dateEnd) >= dateNow);

  // On filtre les infos que l'on veut renvoyer en front
  const trips = tripsBrut.map((trip) => parseTrip(trip));

  return res.json({
    result: true,
    user: {
      token: savedUser.tokenSession,
      tokenUser: savedUser.tokenUser,
      username: savedUser.username,
      email: savedUser.email,
      image: savedUser.image,
      friends: savedUser.friends,
    },
    trips,
  });
});

// Route pour la connexion (signin)
router.post("/signin", async (req, res) => {
  if (!checkBody(req.body, ["email", "password"])) {
    return res.json({ result: false, error: "Missing or empty fields" });
  }

  // Vérifier si l'utilisateur est déjà enregistré (email insensible à la casse ) et qu'il est actif
  const user = await User.findOne({ email: { $regex: req.body.email, $options: "i" }, active: true });
  if (user) {
    //if (user && bcrypt.compareSync(req.body.password, user.password)) {
    await user.populate("trips");
    await user.populate("friends");
    await user.populate([{ path: "trips.user" }, { path: "trips.participants" }]);

    // On récupère les données de tous les friends du user
    const friendsData = user.friends;
    // On filtre les propriétés que l'on veut renvoyer pour chaque ami
    const friends = friendsData.map((friend) => {
      return { tokenUser: friend.tokenUser, username: friend.username, email: friend.email };
    });

    // On filtre la date pour afficher seulement les Trip dont la date de fin est égale ou après aujourd'hui
    const tripsBrut = user.trips.filter((trip) => new Date(trip.dateEnd) >= dateNow);
    // On filtre les infos que l'on veut renvoyer en front
    const trips = tripsBrut.map((trip) => parseTrip(trip));

    return res.json({
      result: true,
      user: {
        token: user.tokenSession,
        tokenUser: user.tokenUser,
        username: user.username,
        email: user.email,
        image: user.image,
        friends: friends,
      },
      trips,
    });
  } else {
    res.json({ result: false, error: "User not found or wrong password" });
  }
});

// Route pour la connexion avec token (isconected)
router.post("/isconnected", async (req, res) => {
  if (!checkBody(req.body, ["token"])) {
    return res.json({ result: false, error: "Missing or empty fields" });
  }

  // Vérifier si l'utilisateur avec ce tokenSession existe
  const user = await User.findOne({ tokenSession: req.body.token, active: true });
  if (user) {
    await user.populate("trips");
    await user.populate("friends");
    await user.populate([{ path: "trips.user" }, { path: "trips.participants" }]);

    // On récupère les données de tous les friends du user
    const friendsData = user.friends;
    // On filtre les propriétés que l'on veut renvoyer pour chaque ami
    const friends = friendsData.map((friend) => {
      return { tokenUser: friend.tokenUser, username: friend.username, email: friend.email };
    });

    // On filtre la date pour afficher seulement les Trip dont la date de fin est égale ou après aujourd'hui
    const tripsBrut = user.trips.filter((trip) => new Date(trip.dateEnd) >= dateNow);
    // On filtre les infos que l'on veut renvoyer en front
    const trips = tripsBrut.map((trip) => parseTrip(trip));

    return res.json({
      result: true,
      user: {
        token: user.tokenSession,
        tokenUser: user.tokenUser,
        username: user.username,
        email: user.email,
        image: user.image,
        friends: friends,
      },
      trips,
    });
  } else {
    res.json({ result: false, error: "" });
  }
});

// Route pour la liste des users (sauf celui qui fait la requête)
router.get("/list", async (req, res) => {
  // On vérifie si les infos obligatoires sont bien renseignées
  if (!checkBody(req.query, ["token"])) {
    return res.status(404).json({ result: false, error: "Missing or empty fields" });
  }

  // On vérifie si l'utilisateur existe, et si oui on renvoie ses infos
  const user = await checkTokenSession(req.query.token);
  if (!user) {
    return res.status(404).json({ result: false, error: "User not found" });
  }
  // Récupération des amis de l'utilisateur
  await user.populate("friends");
  const findFriends = user.friends.map((friend) => friend._id);

  // On récupère les données de tous les users sauf celui qui fait la requête et ses amis
  const findUsers = await User.find({
    _id: { $ne: user._id, $nin: findFriends }
  });

  // On filtre les données que l'on veut renvoyer
  const users = findUsers.map((otherUser) => {
    return { tokenUser: otherUser.tokenUser, username: otherUser.username, email: otherUser.email };
  });
  res.json({ reuslt: true, users });
});

router.get("/friendsList", async (req, res) => {
  // On vérifie si les infos obligatoires sont bien renseignées
  if (!checkBody(req.query, ["token"])) {
    return res.status(404).json({ result: false, error: "Missing or empty fields" });
  }

  // On vérifie si l'utilisateur existe, et si oui on renvoie ses infos
  const user = await checkTokenSession(req.query.token);
  if (!user) {
    return res.status(404).json({ result: false, error: "User not found" });
  }
  await user.populate("friends");
  // On récupère les données de tous les friends du user
  const friendsData = user.friends;
  // On filtre les propriétés que l'on veut renvoyer pour chaque ami
  const friends = friendsData.map((friend) => {
    return { tokenUser: friend.tokenUser, username: friend.username, email: friend.email };
  });
  res.json({ reuslt: true, friends });
});

router.put("/updateFriends", async (req, res) => {
  console.log("token", req.token);
  console.log("tkFriend", req.tokenFriend);
  console.log("modifFriend", req.modifFriend);
  // On vérifie si les infos obligatoires sont bien renseignées
  if (!checkBody(req.body, ["token", "tokenFriend", "modifFriend"])) {
    return res.status(404).json({ result: false, error: "Missing or empty fields" });
  }
  const { token, tokenFriend, modifFriend } = req.body;

  try {
    // On vérifie si l'utilisateur existe, et si oui on renvoie ses infos
    const user = await User.findOne({ tokenSession: token }).populate("friends");
    if (!user) {
      return res.status(404).json({ result: false, error: "User not found" });
    }
    // On vérifie si le friend existe, et si oui on renvoie ses infos
    const friend = await User.findOne({ tokenUser: tokenFriend }).populate("friends");
    if (!friend) {
      return res.status(404).json({ result: false, error: "Friend not found" });
    }

    console.log("user", user);

    // Si modiFriend est égale à true cela veut dire qu'on ajout un ami
    if (modifFriend) {
      // On ajoute l'ami dans la liste d'amis de l'utilisateur et vice versa
      await User.updateOne({ _id: user._id }, { $push: { friends: friend._id } });
      await User.updateOne({ _id: friend._id }, { $push: { friends: user._id } });
    }
    // Si modiFriend est égale à false cela veut dire qu'on supprime un ami
    if (!modifFriend) {
      // On supprime l'ami de la liste d'amis de l'utilisateur et vice versa
      await User.updateOne({ _id: user._id }, { $pull: { friends: friend._id } });
      await User.updateOne({ _id: friend._id }, { $pull: { friends: user._id } });
    }

    const updatedUser = await User.findOne({ tokenSession: token }).populate("friends");
    const listFriends = updatedUser.friends.map((friend) => {
      return { tokenUser: friend.tokenUser, username: friend.username, email: friend.email };
    });
    console.log("listFriends", listFriends);
    res.json({ result: true, friends: listFriends });
  } catch (error) {
    console.error("Erreur lors de l'update de la list des friends du user :", error);
    return res.status(404).json({ result: false, error: "Erreur lors de l'update de la list des friends du user" });
  }
});

// Route pour modifier les informations de l'utilisateur
router.put("/updateInfos", async (req, res) => {
  // On vérifie si les infos obligatoires sont bien renseignées
  if (!checkBody(req.body, ["token", "username", "email"])) {
    return res.status(404).json({ result: false, error: "Missing or empty fields" });
  }
  const { token, username, email, password } = req.body;

  try {
    // On vérifie si l'utilisateur existe, et si oui on renvoie ses infos
    const user = await checkTokenSession(token);
    console.log(user);
    if (!user) {
      return res.status(404).json({ result: false, error: "User not found" });
    }

    //On update le profil avec les informations données par le user et on recupère ses nouvelles données
    let hash = user.password;
    let updateUser;
    if (password !== "") {
      hash = bcrypt.hashSync(password, 10);
      updateUser = await User.findOneAndUpdate(
        { _id: user._id },
        { $set: { username, email, password: hash } },
        { new: true } // Retourne le document mis à jour
      );
    } else {
      updateUser = await User.findOneAndUpdate(
        { _id: user._id },
        { $set: { username, email } },
        { new: true } // Retourne le document mis à jour
      );
    }
    if (!updateUser) {
      return res.status(404).json({ result: false, error: "Failed to update user" });
    }

    // On filtre les infos que l'on veut renvoyer en front
    const userResult = { username: updateUser.username, email: updateUser.email };

    res.json({ result: true, userData: userResult });
  } catch (error) {
    console.error("Erreur lors de l'update du User :", error);
    return res.status(404).json({ result: false, error: "Erreur lors de l'update du User" });
  }
});

module.exports = router;
